const DOMAINS_URL = "data/domains.json";
const AVATARS_URL = "data/avatars.json";
const NAVIGATION_URL = "data/navigation.json";
const STORE_KEY = "codexKlptDemoTwoState";
const SENSITIVE_FORM_FIELDS = new Set(["student-name"]);

const sessionHome = document.querySelector(".session-home");
const avatarPicker = document.querySelector(".avatar-picker");
const explorer = document.querySelector(".explorer");
const createSessionButton = document.querySelector(".create-session-button");
const storageButton = document.querySelector("[data-action='show-session-store']");
const storageDialog = document.querySelector(".storage-dialog");
const storageDialogContent = document.querySelector(".storage-dialog__content");
const sessionList = document.querySelector(".session-list");
const avatarGrid = document.querySelector(".avatar-grid");
const activeSession = document.querySelector(".active-session");
const selectionBoard = document.querySelector(".selection-board");
const progressTrack = document.querySelector(".progress-track");
const selectionCard = document.querySelector(".selection-card");
const behaviourScreen = document.querySelector(".behaviour-screen");
const behaviourDetail = document.querySelector(".behaviour-detail");
const behaviourOrbit = document.querySelector(".behaviour-orbit");
const statementScreen = document.querySelector(".statement-screen");
const reviewScreen = document.querySelector(".review-screen");

let rootNodes = [];
let avatars = [];
let navigationSteps = [];
let sessions = [];
let activeSessionId = null;
let path = [];
let activeElement = null;
let activePage = "selection";

async function init() {
  try {
    const [domainResponse, avatarResponse, navigationResponse] = await Promise.all([
      fetch(DOMAINS_URL),
      fetch(AVATARS_URL),
      fetch(NAVIGATION_URL)
    ]);

    if (!domainResponse.ok) {
      throw new Error(`Unable to load ${DOMAINS_URL}: ${domainResponse.status}`);
    }

    if (!avatarResponse.ok) {
      throw new Error(`Unable to load ${AVATARS_URL}: ${avatarResponse.status}`);
    }

    if (!navigationResponse.ok) {
      throw new Error(`Unable to load ${NAVIGATION_URL}: ${navigationResponse.status}`);
    }

    const domainData = await domainResponse.json();
    const avatarData = await avatarResponse.json();
    const navigationData = await navigationResponse.json();

    rootNodes = normaliseNodes(domainData.domains ?? [], "domain", []);
    avatars = avatarData.avatars ?? [];
    navigationSteps = navigationData.steps ?? [];
    sessions = loadSessions();

    bindEvents();
    renderHome();
    showView("home");
  } catch (error) {
    sessionHome.innerHTML = `
      <div class="empty-state">
        <h2>Could not load app data</h2>
        <p>Start this through a local server, such as VS Code Live Server, so the browser can fetch the JSON files.</p>
        <small>${error.message}</small>
      </div>
    `;
  }
}

function bindEvents() {
  createSessionButton.addEventListener("click", () => {
    renderAvatarPicker();
    showView("avatars");
  });

  document.querySelector("[data-action='back-home']").addEventListener("click", () => {
    renderHome();
    showView("home");
  });

  document.querySelector("[data-action='exit-session']").addEventListener("click", () => {
    activeSessionId = null;
    path = [];
    activeElement = null;
    activePage = "selection";
    renderHome();
    showView("home");
  });

  storageButton.addEventListener("click", showStoredSessions);
  storageDialog.querySelector("[data-action='close-session-store']").addEventListener("click", () => {
    storageDialog.close();
  });
}

function loadSessions() {
  const fallback = { sessions: [] };

  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY)) ?? fallback;
    const loadedSessions = Array.isArray(stored.sessions) ? stored.sessions.map(ensureSessionShape) : [];
    localStorage.setItem(STORE_KEY, JSON.stringify({ sessions: loadedSessions }, null, 2));
    return loadedSessions;
  } catch {
    return [];
  }
}

function ensureSessionShape(session) {
  return {
    ...session,
    formFields: mergeFormFields(session.formFields ?? [])
  };
}

function mergeFormFields(fields) {
  const requiredFields = [
    "date",
    "observer-name",
    "observational-context",
    "professional-reflection",
    "support-learning"
  ];

  return requiredFields.map((name) => {
    return fields.find((field) => field.name === name) ?? { name, value: "" };
  });
}

function saveSessions() {
  sessions = sessions.map(ensureSessionShape);
  localStorage.setItem(STORE_KEY, JSON.stringify({ sessions }, null, 2));
}

function showStoredSessions() {
  let storedSessions = [];

  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY)) ?? { sessions: [] };
    storedSessions = Array.isArray(stored.sessions) ? stored.sessions.map(ensureSessionShape) : [];
  } catch {
    storedSessions = [];
  }

  storageDialogContent.textContent = JSON.stringify({ sessions: storedSessions }, null, 2);
  storageDialog.showModal();
}

function renderHome() {
  const activeSessions = sessions.filter((session) => !isExpired(session));

  if (!activeSessions.length) {
    sessionList.innerHTML = `<p class="empty-copy">No saved sessions yet. Create one to get started.</p>`;
    return;
  }

  sessionList.replaceChildren(...activeSessions.map(createSessionCard));
}

function createSessionCard(session) {
  const avatar = avatarForSession(session);
  const card = document.createElement("article");
  card.className = "session-card";

  card.innerHTML = `
    <button class="session-card__main" type="button">
      <img src="${avatar.avatar}" alt="">
      <span>
        <strong>${avatarLabel(avatar)}</strong>
        <small>${sessionSummary(session)}</small>
      </span>
    </button>
    <div class="session-menu">
      <button class="icon-button" type="button" aria-label="Session options">⋮</button>
      <div class="session-menu__popover" hidden>
        <button type="button">Delete session</button>
      </div>
    </div>
  `;

  card.querySelector(".session-card__main").addEventListener("click", () => resumeSession(session.id));
  card.querySelector(".icon-button").addEventListener("click", (event) => {
    event.stopPropagation();
    closeMenus(card);
    const popover = card.querySelector(".session-menu__popover");
    popover.hidden = !popover.hidden;
  });
  card.querySelector(".session-menu__popover button").addEventListener("click", () => deleteSession(session.id));

  return card;
}

function renderAvatarPicker() {
  const usedAvatarIds = new Set(sessions.filter((session) => !isExpired(session)).map((session) => session.id));
  const availableAvatars = avatars.filter((avatar) => !usedAvatarIds.has(avatar.id));

  if (!availableAvatars.length) {
    avatarGrid.innerHTML = `<p class="empty-copy">Every avatar is already in use. Delete or resume an existing session to continue.</p>`;
    return;
  }

  avatarGrid.replaceChildren(...availableAvatars.map(createAvatarButton));
}

function createAvatarButton(avatar) {
  const button = document.createElement("button");
  button.className = "avatar-option";
  button.type = "button";
  button.innerHTML = `
    <img src="${avatar.avatar}" alt="">
    <span>${avatarLabel(avatar)}</span>
  `;
  button.addEventListener("click", () => createSession(avatar));
  return button;
}

function createSession(avatar) {
  const now = new Date();
  const expiry = new Date(now);
  expiry.setMonth(expiry.getMonth() + 3);

  const session = {
    id: avatar.id,
    created: now.toISOString(),
    updated: now.toISOString(),
    expiry: expiry.toISOString(),
    pageIndex: 0,
    domain: null,
    subDomain: null,
    elements: [],
    formFields: mergeFormFields([])
  };

  sessions = [...sessions, session];
  saveSessions();
  resumeSession(session.id);
}

function resumeSession(sessionId) {
  activeSessionId = sessionId;
  const session = currentSession();
  path = pathFromSession(session);
  const resumedElement = shouldResumeElement(session) ? lastSelectedElement(session) : null;
  activeElement = resumedElement;
  activePage = pageForSession(session, resumedElement);

  renderActiveSession();
  renderProgressNav(resumedElement);

  if (activePage === "review") {
    renderReviewScreen();
  } else if (activePage === "statement") {
    renderStatementScreen();
  } else if (resumedElement) {
    renderBehaviourScreen(resumedElement, selectedBehaviourId(resumedElement));
  } else {
    renderSelectionScreen();
  }

  showView("explorer");
}

function deleteSession(sessionId) {
  sessions = sessions.filter((session) => session.id !== sessionId);
  saveSessions();

  if (activeSessionId === sessionId) {
    activeSessionId = null;
    path = [];
    activeElement = null;
    activePage = "selection";
  }

  renderHome();
  renderAvatarPicker();
}

function showView(view) {
  sessionHome.hidden = view !== "home";
  avatarPicker.hidden = view !== "avatars";
  explorer.hidden = view !== "explorer";
}

function renderActiveSession() {
  const session = currentSession();
  const avatar = avatarForSession(session);

  activeSession.innerHTML = `
    <img src="${avatar.avatar}" alt="">
    <span>
      <strong>${avatarLabel(avatar)}</strong>
      <small>Autosaved ${formatDate(session.updated)}</small>
    </span>
  `;
}

function normaliseNodes(nodes, type, parentPath) {
  return nodes
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((node, position) => {
      const nodePath = [...parentPath, position];
      const childType = node.subDomains?.length ? "subdomain" : "element";
      const rawChildren = node.subDomains?.length ? node.subDomains : node.elements ?? [];
      const children = rawChildren.length ? normaliseNodes(rawChildren, childType, nodePath) : [];

      return {
        ...node,
        id: node.id || `${type}-${nodePath.join("-")}`,
        name: node.name.trim(),
        type,
        path: nodePath,
        color: colorForPath(nodePath),
        children
      };
    });
}

function colorForPath(nodePath) {
  const [domainIndex = 0, subIndex = 0, elementIndex = 0] = nodePath;
  const palette = [
    { hue: 209, saturation: 70, lightness: 34 },
    { hue: 24, saturation: 78, lightness: 36 },
    { hue: 198, saturation: 66, lightness: 36 },
    { hue: 18, saturation: 72, lightness: 34 }
  ][domainIndex % 4];
  const hue = (palette.hue + subIndex * 8 - elementIndex * 4 + 360) % 360;
  const saturation = Math.max(58, palette.saturation - nodePath.length * 3);
  const lightness = Math.min(48, palette.lightness + nodePath.length * 4);

  return {
    accent: `hsl(${hue} ${saturation}% ${lightness}%)`,
    glow: `hsl(${hue} ${Math.max(52, saturation - 8)}% ${Math.min(56, lightness + 12)}%)`
  };
}

function renderSelectionScreen() {
  const session = currentSession();
  const domain = selectedDomain();
  const subDomains = domain?.children?.filter((node) => node.type === "subdomain") ?? [];
  const subDomain = selectedSubDomain();
  const elements = elementOptions();
  const selectedElementIds = new Set(session?.elements?.map((element) => element.id) ?? []);

  selectionCard.hidden = true;
  behaviourScreen.hidden = true;
  statementScreen.hidden = true;
  reviewScreen.hidden = true;
  selectionBoard.hidden = false;
  activeElement = null;
  activePage = "selection";
  renderProgressNav();

  selectionBoard.replaceChildren(
    createSelectionIntro(session, domain, subDomain),
    createSelectionRow("Domains", "Choose one broad area of learning and development.", rootNodes, domain?.id ?? null, selectDomain),
    createSelectionRow(
      "Subdomains",
      subDomains.length ? "Choose a more specific focus area." : "This domain goes straight to elements.",
      subDomains,
      subDomain?.id ?? null,
      selectSubDomain,
      "Select a domain with subdomains to use this row."
    ),
    createSelectionRow(
      "Elements",
      "Toggle one or more observable learning elements.",
      elements,
      selectedElementIds,
      toggleElement,
      domain ? "Select a subdomain first to reveal its elements." : "Select a domain first to reveal elements.",
      true
    ),
    createSelectionActions(session)
  );
}

function createSelectionIntro(session, domain, subDomain) {
  const selectedCount = session?.elements?.length ?? 0;
  const panel = document.createElement("article");
  panel.className = "selection-intro";
  panel.innerHTML = `
    <div>
      <p class="eyebrow">Learning selection</p>
      <h2>Choose the focus for this observation</h2>
    </div>
    <p>${selectionSummaryText(domain, subDomain, selectedCount)}</p>
  `;

  return panel;
}

function createSelectionRow(title, hint, nodes, selected, onSelect, emptyCopy, allowMultiple = false) {
  const row = document.createElement("section");
  row.className = "selection-row";
  row.setAttribute("aria-label", title);
  row.innerHTML = `
    <div class="selection-row__heading">
      <h3>${title}</h3>
      <p>${hint}</p>
    </div>
  `;

  const scroller = document.createElement("div");
  scroller.className = "selection-row__scroller";

  if (!nodes.length) {
    scroller.innerHTML = `<p class="selection-row__empty">${emptyCopy}</p>`;
  } else {
    scroller.replaceChildren(...nodes.map((node) => {
      const isSelected = allowMultiple ? selected.has(node.id) : selected === node.id;
      return createSelectionPanel(node, isSelected, allowMultiple, onSelect);
    }));
  }

  row.append(scroller);
  return row;
}

function createSelectionPanel(node, isSelected, allowMultiple, onSelect) {
  const button = document.createElement("button");
  button.className = "selection-panel";
  button.type = "button";
  button.style.setProperty("--accent", node.color.accent);
  button.style.setProperty("--accent-glow", node.color.glow);
  button.dataset.type = node.type;
  button.dataset.nodeId = node.id;
  button.dataset.selected = String(isSelected);
  button.setAttribute("aria-pressed", String(isSelected));
  button.innerHTML = `
    <span class="selection-panel__index">${String(node.index).padStart(2, "0")}</span>
    <strong>${escapeHtml(node.name)}</strong>
    <small>${panelHint(node, allowMultiple, isSelected)}</small>
  `;
  button.addEventListener("click", () => onSelect(node));

  return button;
}

function createSelectionActions(session) {
  const actions = document.createElement("div");
  actions.className = "page-actions selection-actions";

  const previous = document.createElement("button");
  previous.className = "secondary-button";
  previous.type = "button";
  previous.textContent = "Previous";
  previous.addEventListener("click", () => {
    renderAvatarPicker();
    showView("avatars");
  });

  const next = document.createElement("button");
  next.className = "primary-button";
  next.type = "button";
  next.textContent = "Next";
  next.disabled = !session?.elements?.length;
  next.addEventListener("click", () => {
    const element = lastSelectedElement(session);

    if (!element) {
      return;
    }

    path = pathForNode(element);
    persistSelection(element, selectedBehaviourId(element), "behaviours");
    renderBehaviourScreen(element, selectedBehaviourId(element));
    renderProgressNav(element);
    renderActiveSession();
  });

  actions.append(previous, next);
  return actions;
}

function selectionSummaryText(domain, subDomain, selectedCount) {
  if (!domain) {
    return "Start with a domain, then slide each row sideways if more panels are available.";
  }

  const subDomainText = subDomain ? `, ${subDomain.name}` : "";
  const elementText = selectedCount === 1 ? "1 element selected" : `${selectedCount} elements selected`;
  return `${escapeHtml(domain.name)}${escapeHtml(subDomainText)}: ${elementText}.`;
}

function panelHint(node, allowMultiple, isSelected) {
  if (allowMultiple) {
    return isSelected ? "Selected" : "Tap to add";
  }

  if (node.children.length) {
    return `${node.children.length} ${node.children.length === 1 ? "item" : "items"}`;
  }

  return isSelected ? "Selected" : "Tap to select";
}

function selectDomain(domain) {
  path = [domain];
  activeElement = null;
  clearSelectedElements();
  persistSelection();
  renderSelectionScreen();
  renderActiveSession();
}

function selectSubDomain(subDomain) {
  path = [selectedDomain(), subDomain].filter(Boolean);
  activeElement = null;
  clearSelectedElements();
  persistSelection();
  renderSelectionScreen();
  renderActiveSession();
}

function toggleElement(elementNode) {
  const session = currentSession();

  if (!session) {
    return;
  }

  path = pathForNode(elementNode);
  activeElement = null;

  if (session.elements.some((element) => element.id === elementNode.id)) {
    session.elements = session.elements.filter((element) => element.id !== elementNode.id);
    persistSelection();
  } else {
    persistSelection(elementNode, selectedBehaviourId(elementNode), "selection");
  }

  renderSelectionScreen();
  renderActiveSession();
}

function selectedDomain() {
  return path.find((node) => node?.type === "domain") ?? null;
}

function selectedSubDomain() {
  return path.find((node) => node?.type === "subdomain") ?? null;
}

function elementOptions() {
  const domain = selectedDomain();

  if (!domain) {
    return [];
  }

  const subDomains = domain.children.filter((node) => node.type === "subdomain");

  if (!subDomains.length) {
    return domain.children.filter((node) => node.type === "element");
  }

  return selectedSubDomain()?.children?.filter((node) => node.type === "element") ?? [];
}

function clearSelectedElements() {
  const session = currentSession();

  if (session) {
    session.elements = [];
  }
}

function renderBehaviourScreen(elementNode = null, requestedBehaviourId = null) {
  const session = currentSession();
  const elements = selectedElementNodes(session);
  const focusedElement = elementNode ?? elements.at(-1);

  if (!session || !focusedElement) {
    renderSelectionScreen();
    return;
  }

  const behaviours = behavioursForElement(focusedElement);
  const selectedBehaviour = behaviours.find((behaviour) => behaviour.id === requestedBehaviourId) ??
    behaviours.find((behaviour) => behaviour.id === selectedBehaviourId(focusedElement)) ??
    behaviours[0];

  activeElement = focusedElement;
  activePage = "behaviours";
  selectionBoard.hidden = true;
  selectionCard.hidden = true;
  behaviourScreen.hidden = false;
  statementScreen.hidden = true;
  reviewScreen.hidden = true;
  behaviourScreen.style.setProperty("--accent", focusedElement.color.accent);
  behaviourScreen.style.setProperty("--accent-glow", focusedElement.color.glow);
  behaviourDetail.dataset.behaviourId = selectedBehaviour.id;
  behaviourDetail.dataset.elementId = focusedElement.id;
  behaviourDetail.querySelector("h2").textContent = selectedBehaviour.name;
  behaviourDetail.querySelector(".behaviour-detail__description").innerHTML = selectedBehaviour.description;
  behaviourOrbit.replaceChildren(
    createBehaviourIntro(elements.length),
    ...elements.map((selectedElement) => createBehaviourRow(selectedElement, focusedElement.id, selectedBehaviour.id)),
    behaviourDetail,
    createBehaviourActions(focusedElement, selectedBehaviour.id)
  );

  behaviourScreen.animate(
    [
      { opacity: 0.92, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)" }
    ],
    { duration: 180, easing: "ease-out", fill: "forwards" }
  );
}

function createBehaviourIntro(elementCount) {
  const intro = document.createElement("article");
  intro.className = "behaviour-intro";
  intro.innerHTML = `
    <div>
      <p class="eyebrow">Behaviour selection</p>
      <h2>Choose a behaviour for each selected element</h2>
    </div>
    <p>${elementCount === 1 ? "1 element selected" : `${elementCount} elements selected`}. Tap a behaviour to update the detail panel.</p>
  `;

  return intro;
}

function createBehaviourRow(elementNode, focusedElementId, focusedBehaviourId) {
  const row = document.createElement("section");
  row.className = "behaviour-row";
  row.style.setProperty("--accent", elementNode.color.accent);
  row.style.setProperty("--accent-glow", elementNode.color.glow);
  row.setAttribute("aria-label", `${elementNode.name} behaviours`);

  const behaviours = behavioursForElement(elementNode);
  const selectedId = selectedBehaviourId(elementNode);
  const isFocusedElement = elementNode.id === focusedElementId;

  row.innerHTML = `
    <div class="behaviour-row__element">
      <span>${String(elementNode.index).padStart(2, "0")}</span>
      <strong>${escapeHtml(elementNode.name)}</strong>
      <small>${isFocusedElement ? "Showing details" : "Selected element"}</small>
    </div>
    <div class="behaviour-row__divider" aria-hidden="true"></div>
  `;

  const scroller = document.createElement("div");
  scroller.className = "behaviour-row__scroller";
  scroller.replaceChildren(...behaviours.map((behaviour, index) => {
    return createBehaviourButton(
      elementNode,
      behaviour,
      index,
      behaviours.length,
      selectedId === behaviour.id,
      isFocusedElement && focusedBehaviourId === behaviour.id
    );
  }));

  row.append(scroller);
  return row;
}

function createBehaviourActions(focusedElement, focusedBehaviourId) {
  const actions = document.createElement("div");
  actions.className = "page-actions behaviour-actions";

  const previous = document.createElement("button");
  previous.className = "secondary-button";
  previous.type = "button";
  previous.textContent = "Previous";
  previous.addEventListener("click", () => renderSelectionScreen());

  const next = document.createElement("button");
  next.className = "primary-button";
  next.type = "button";
  next.textContent = "Next";
  next.addEventListener("click", () => {
    persistSelection(focusedElement, focusedBehaviourId, "statement");
    renderStatementScreen();
  });

  actions.append(previous, next);
  return actions;
}

function behavioursForElement(elementNode) {
  return elementNode.behaviours?.length ? elementNode.behaviours : [fallbackBehaviour(elementNode)];
}

function selectedElementNodes(session) {
  return session?.elements
    ?.map((element) => findNodeById(rootNodes, element.id))
    .filter(Boolean) ?? [];
}

function createBehaviourButton(elementNode, behaviour, index, total, isSelected, isFocused) {
  const button = document.createElement("button");
  const shadeProgress = total <= 1 ? 0 : index / (total - 1);
  const lightMix = `${Math.round(38 + shadeProgress * 50)}%`;
  const darkMix = `${Math.round(58 + shadeProgress * 32)}%`;

  button.className = "behaviour-button";
  button.type = "button";
  button.style.setProperty("--mix-light", lightMix);
  button.style.setProperty("--mix-dark", darkMix);
  button.dataset.selected = String(isSelected);
  button.dataset.focused = String(isFocused);
  button.setAttribute("aria-pressed", String(isSelected));
  button.innerHTML = `
    <span>${String(behaviour.index).padStart(2, "0")}</span>
    <strong>${behaviour.name}</strong>
  `;
  button.addEventListener("click", () => {
    path = pathForNode(elementNode);
    persistSelection(elementNode, behaviour.id, "behaviours");
    renderBehaviourScreen(elementNode, behaviour.id);
    renderProgressNav(elementNode);
    renderActiveSession();
  });

  return button;
}

function renderProgressNav(elementNode = activeElement) {
  progressTrack.replaceChildren(...navigationSteps.map((step, index) => {
    return createProgressStep(step, index, progressStateForStep(step.id, elementNode));
  }));
}

function createProgressStep(step, index, state) {
  const button = document.createElement("button");
  button.className = "progress-step";
  button.type = "button";
  button.title = step.description;
  button.dataset.state = state.status;
  button.dataset.step = step.id;
  button.disabled = !state.canNavigate;
  button.innerHTML = `
    <span class="progress-step__description">${step.description}</span>
    <span class="progress-step__node">${index + 1}</span>
    <span class="progress-step__title">${step.title}</span>
  `;
  button.addEventListener("click", () => navigateToStep(step.id));
  return button;
}

function progressStateForStep(stepId, elementNode) {
  const session = currentSession();
  const hasSelection = Boolean(session?.domain && session?.elements?.length);
  const hasBehaviour = Boolean(session?.elements?.some((element) => element.behaviour));
  const hasStatement = Boolean(session?.pageIndex >= 2 || hasFormContent(session));
  const hasReview = Boolean(session?.pageIndex >= 3);
  const currentStep = currentStepId(elementNode);

  if (stepId === currentStep) {
    return { status: "current", canNavigate: true };
  }

  if (
    (stepId === "selection" && hasSelection) ||
    (stepId === "behaviours" && hasBehaviour) ||
    (stepId === "statement" && hasStatement) ||
    (stepId === "review" && hasReview)
  ) {
    return { status: "complete", canNavigate: true };
  }

  if (stepId === "review" && hasStatement) {
    return { status: "pending", canNavigate: true };
  }

  return { status: "pending", canNavigate: false };
}

function currentStepId(elementNode) {
  if (activePage === "statement" || activePage === "review") {
    return activePage;
  }

  if (elementNode) {
    return "behaviours";
  }

  return "selection";
}

function navigateToStep(stepId) {
  if (stepId === "selection") {
    renderSelectionScreen();
    return;
  }

  if (stepId === "behaviours") {
    const elementNode = activeElement ?? lastSelectedElement(currentSession());

    if (elementNode) {
      path = pathForNode(elementNode);
      renderProgressNav(elementNode);
      renderBehaviourScreen(elementNode, selectedBehaviourId(elementNode));
    }
    return;
  }

  if (stepId === "statement" && lastSelectedElement(currentSession())) {
    renderStatementScreen();
    return;
  }

  if (stepId === "review" && lastSelectedElement(currentSession())) {
    renderReviewScreen();
  }
}

function renderStatementScreen() {
  const context = selectedStatementContext();

  if (!context) {
    return;
  }

  activeElement = context.activeElement;
  activePage = "statement";
  selectionBoard.hidden = true;
  behaviourScreen.hidden = true;
  selectionCard.hidden = true;
  reviewScreen.hidden = true;
  statementScreen.hidden = false;
  persistPage("statement");
  renderProgressNav(context.activeElement);
  renderActiveSession();

  statementScreen.innerHTML = `
    <article class="statement-card">
      <p class="eyebrow">Evidence statement</p>
      <h2>Learning Progression Statement</h2>

      <section class="summary-block">
        <h3>Learning domain summary</h3>
        <p><strong>${escapeHtml(context.domain.name)}</strong>: ${escapeHtml(context.domain.summary ?? "Summary to be added.")}</p>
      </section>

      <div class="form-grid">
        ${fieldMarkup("date", "Date", "input", "date")}
        ${fieldMarkup("observer-name", "Observer's name")}
      </div>

      ${fieldMarkup("observational-context", "Description of observation context or evidence collected", "textarea")}

      ${progressionStackMarkup(context.items)}

      ${fieldMarkup("professional-reflection", "Professional reflection (learning and development area links, theoretical links, educator's principles and practices)", "textarea")}
      ${fieldMarkup("support-learning", "How can you support this learning", "textarea")}

      <div class="page-actions">
        <button class="secondary-button" type="button" data-action="previous-behaviour">Previous</button>
        <button class="primary-button" type="button" data-action="next-review">Next</button>
      </div>
    </article>
  `;

  bindFormAutosave(statementScreen);
  statementScreen.querySelector("[data-action='previous-behaviour']").addEventListener("click", () => {
    renderBehaviourScreen(context.activeElement, selectedBehaviourId(context.activeElement));
    renderProgressNav(context.activeElement);
  });
  statementScreen.querySelector("[data-action='next-review']").addEventListener("click", () => renderReviewScreen());
}

function renderReviewScreen() {
  const context = selectedStatementContext();

  if (!context) {
    return;
  }

  activeElement = context.activeElement;
  activePage = "review";
  selectionBoard.hidden = true;
  behaviourScreen.hidden = true;
  selectionCard.hidden = true;
  statementScreen.hidden = true;
  reviewScreen.hidden = false;
  persistPage("review");
  renderProgressNav(context.activeElement);
  renderActiveSession();

  reviewScreen.innerHTML = `
    <article class="statement-card review-card">
      <p class="eyebrow">Final check</p>
      <h2>Review Statement</h2>

      ${fieldMarkup("student-name", "Student's name")}

      <dl class="review-list">
        <div><dt>Domain</dt><dd>${escapeHtml(context.domain.name)}</dd></div>
        <div><dt>Elements</dt><dd>${context.items.length}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(formValue("date") || "Not entered")}</dd></div>
        <div><dt>Observer</dt><dd>${escapeHtml(formValue("observer-name") || "Not entered")}</dd></div>
      </dl>

      <section class="summary-block">
        <h3>Learning domain summary</h3>
        <p>${escapeHtml(context.domain.summary ?? "Summary to be added.")}</p>
      </section>

      ${progressionStackMarkup(context.items)}

      ${reviewTextBlock("Description of observation context or evidence collected", "observational-context")}
      ${reviewTextBlock("Professional reflection", "professional-reflection")}
      ${reviewTextBlock("How can you support this learning", "support-learning")}

      <div class="page-actions">
        <button class="secondary-button" type="button" data-action="previous-statement">Previous</button>
        <button class="primary-button" type="button" data-action="download-pdf">Download PDF</button>
      </div>
    </article>
  `;

  bindFormAutosave(reviewScreen);
  reviewScreen.querySelector("[data-action='previous-statement']").addEventListener("click", () => renderStatementScreen());
  reviewScreen.querySelector("[data-action='download-pdf']").addEventListener("click", () => window.print());
}

function fieldMarkup(name, label, kind = "input", type = "text") {
  const value = escapeHtml(formValue(name));

  if (kind === "textarea") {
    return `
      <label class="form-field form-field--wide">
        <span>${label}</span>
        <textarea name="${name}" rows="5">${value}</textarea>
      </label>
    `;
  }

  return `
    <label class="form-field">
      <span>${label}</span>
      <input name="${name}" type="${type}" value="${value}">
    </label>
  `;
}

function reviewTextBlock(label, name) {
  return `
    <section class="review-text-block">
      <h3>${label}</h3>
      <p>${escapeHtml(formValue(name) || "Not entered")}</p>
    </section>
  `;
}

function progressionStackMarkup(items) {
  return `
    <section class="progression-stack" aria-label="Selected behaviours and next behaviours">
      ${items.map((item) => `
        <article class="progression-item" style="--accent: ${item.element.color.accent}">
          <div class="progression-item__heading">
            <span>${String(item.element.index).padStart(2, "0")}</span>
            <h3>${escapeHtml(item.element.name)}</h3>
          </div>
          <div class="evidence-grid">
            <div class="evidence-panel">
              <h3>What you observed</h3>
              <p class="behaviour-name">${escapeHtml(item.behaviour.name)}</p>
              ${item.behaviour.description}
            </div>
            <div class="evidence-panel">
              <h3>What is likely to be the next step in learning progression</h3>
              <p class="behaviour-name">${escapeHtml(item.nextBehaviour?.name ?? "Final behaviour")}</p>
              ${item.nextBehaviour?.description ?? "<p>This is the final behaviour currently available for this element.</p>"}
            </div>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function bindFormAutosave(container) {
  container.querySelectorAll("input[name], textarea[name]").forEach((field) => {
    field.addEventListener("input", () => updateFormField(field.name, field.value));
  });
}

function updateFormField(name, value) {
  if (SENSITIVE_FORM_FIELDS.has(name)) {
    return;
  }

  const session = currentSession();

  if (!session) {
    return;
  }

  session.formFields = mergeFormFields(session.formFields);
  session.formFields = session.formFields.map((field) => {
    return field.name === name ? { ...field, value } : field;
  });
  session.updated = new Date().toISOString();
  saveSessions();
  renderActiveSession();
}

function persistSelection(elementNode = null, behaviourId = null, nextPage = null) {
  const session = currentSession();

  if (!session) {
    return;
  }

  session.updated = new Date().toISOString();
  session.pageIndex = pageIndexFor(nextPage ?? (elementNode ? "behaviours" : "selection"));
  session.domain = path.find((node) => node.type === "domain")?.id ?? null;
  session.subDomain = path.find((node) => node.type === "subdomain")?.id ?? null;

  if (elementNode) {
    const fallbackId = elementNode.behaviours?.[0]?.id ?? null;
    const existingElement = session.elements.find((element) => element.id === elementNode.id);
    const nextElement = {
      id: elementNode.id,
      behaviour: behaviourId ?? existingElement?.behaviour ?? fallbackId
    };

    session.elements = existingElement
      ? session.elements.map((element) => element.id === elementNode.id ? nextElement : element)
      : [...session.elements, nextElement];
  }

  saveSessions();
}

function persistPage(nextPage) {
  const session = currentSession();

  if (!session) {
    return;
  }

  session.updated = new Date().toISOString();
  session.pageIndex = pageIndexFor(nextPage);
  saveSessions();
}

function pathFromSession(session) {
  if (!session?.domain) {
    return [];
  }

  const domain = rootNodes.find((node) => node.id === session.domain);

  if (!domain) {
    return [];
  }

  if (!session.subDomain) {
    return [domain];
  }

  const subDomain = domain.children.find((node) => node.id === session.subDomain);
  return subDomain ? [domain, subDomain] : [domain];
}

function fallbackBehaviour(elementNode) {
  return {
    id: `${elementNode.id}-fallback-behaviour`,
    index: 1,
    name: "Behaviour 1",
    description: "<p>No behaviour descriptions have been added for this element yet.</p>"
  };
}

function selectedBehaviourId(elementNode) {
  const session = currentSession();
  return session?.elements.find((element) => element.id === elementNode.id)?.behaviour ?? elementNode.behaviours?.[0]?.id ?? null;
}

function lastSelectedElement(session) {
  const latestElement = session?.elements?.at(-1);

  if (!latestElement) {
    return null;
  }

  return findNodeById(rootNodes, latestElement.id);
}

function shouldResumeElement(session) {
  return Boolean(session?.pageIndex && session.pageIndex > 0 && session.elements?.length);
}

function findNodeById(nodes, nodeId) {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    const childMatch = findNodeById(node.children ?? [], nodeId);

    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function pathForNode(node) {
  const nodePath = [];
  let currentLevel = rootNodes;

  for (const position of node.path.slice(0, -1)) {
    const currentNode = currentLevel[position];

    if (!currentNode) {
      break;
    }

    nodePath.push(currentNode);
    currentLevel = currentNode.children ?? [];
  }

  return nodePath;
}

function selectedStatementContext() {
  const session = currentSession();
  const items = selectedElementNodes(session).map((element) => {
    const elementPath = pathForNode(element);
    const behaviours = behavioursForElement(element);
    const behaviour = behaviours.find((item) => item.id === selectedBehaviourId(element)) ?? behaviours[0];
    const nextBehaviour = behaviours.find((item) => item.index === behaviour.index + 1) ?? null;

    return {
      domain: elementPath.find((node) => node.type === "domain") ?? rootNodes.find((node) => node.path[0] === element.path[0]),
      subDomain: elementPath.find((node) => node.type === "subdomain") ?? null,
      element,
      behaviours,
      behaviour,
      nextBehaviour
    };
  });
  const activeStatementElement = activeElement ?? items.at(-1)?.element ?? null;

  if (!session || !items.length || !activeStatementElement) {
    return null;
  }

  path = pathForNode(activeStatementElement);

  return {
    domain: items[0].domain,
    activeElement: activeStatementElement,
    items
  };
}

function pageForSession(session, resumedElement) {
  if (session?.pageIndex >= 3) {
    return "review";
  }

  if (session?.pageIndex >= 2) {
    return "statement";
  }

  if (resumedElement) {
    return "behaviours";
  }

  return "selection";
}

function pageIndexFor(stepId) {
  const indexes = {
    selection: 0,
    behaviours: 1,
    statement: 2,
    review: 3
  };

  return indexes[stepId] ?? 0;
}

function hasFormContent(session) {
  return Boolean(session?.formFields?.some((field) => field.value));
}

function formValue(name) {
  const session = currentSession();
  return session?.formFields?.find((field) => field.name === name)?.value ?? "";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentSession() {
  return sessions.find((session) => session.id === activeSessionId);
}

function avatarForSession(session) {
  return avatars.find((avatar) => avatar.id === session?.id) ?? avatars[0] ?? { avatar: "", id: "" };
}

function avatarLabel(avatar) {
  return avatar.avatar
    .split("/")
    .pop()
    .replace(".png", "")
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function sessionSummary(session) {
  if (session.pageIndex >= 3) {
    return "Resume review";
  }

  if (session.pageIndex >= 2) {
    return "Resume statement";
  }

  if (session.pageIndex && session.elements?.length) {
    return "Resume behaviour selection";
  }

  if (session.elements?.length) {
    return "Resume element selection";
  }

  return session.domain ? "Resume learning selection" : "Start exploring";
}

function isExpired(session) {
  return session.expiry && new Date(session.expiry) < new Date();
}

function closeMenus(currentCard) {
  document.querySelectorAll(".session-menu__popover").forEach((popover) => {
    if (!currentCard.contains(popover)) {
      popover.hidden = true;
    }
  });
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function clamp(min, value, max) {
  return Math.min(Math.max(value, min), max);
}

init();

