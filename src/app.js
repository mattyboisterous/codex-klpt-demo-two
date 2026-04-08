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
const orbit = document.querySelector(".orbit");
const progressTrack = document.querySelector(".progress-track");
const selectionCard = document.querySelector(".selection-card");
const behaviourScreen = document.querySelector(".behaviour-screen");
const behaviourDetail = document.querySelector(".behaviour-detail");
const behaviourOrbit = document.querySelector(".behaviour-orbit");
const statementScreen = document.querySelector(".statement-screen");
const reviewScreen = document.querySelector(".review-screen");
const template = document.querySelector("#node-button-template");

let rootNodes = [];
let avatars = [];
let navigationSteps = [];
let sessions = [];
let activeSessionId = null;
let path = [];
let activeElement = null;
let activePage = "domains";

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
    activePage = "domains";
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
    renderLevel(currentChildren(), currentLabel());
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
    activePage = "domains";
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
  const hue = (domainIndex * 72 + subIndex * 22 + elementIndex * 9 + 204) % 360;
  const saturation = Math.max(62, 82 - nodePath.length * 4);
  const lightness = Math.min(62, 48 + nodePath.length * 4);

  return {
    accent: `hsl(${hue} ${saturation}% ${lightness}%)`,
    glow: `hsl(${hue} ${saturation}% 74%)`
  };
}

function renderLevel(nodes, label) {
  selectionCard.hidden = true;
  behaviourScreen.hidden = true;
  statementScreen.hidden = true;
  reviewScreen.hidden = true;
  orbit.hidden = false;
  activeElement = null;
  activePage = stepIdForNodes(nodes);
  orbit.dataset.count = nodes.length;
  orbit.dataset.state = "leaving";

  window.setTimeout(() => {
    orbit.replaceChildren(...nodes.map((node, index) => createNodeButton(node, index, nodes.length)));
    orbit.dataset.state = "entering";
    orbit.setAttribute("aria-label", label);

    window.setTimeout(() => {
      orbit.dataset.state = "ready";
    }, 420);
  }, 180);
}

function createNodeButton(node, index, total) {
  const button = template.content.firstElementChild.cloneNode(true);
  const angle = angleForPosition(index, total);
  const radius = total <= 1 ? 0 : clamp(128, 18 * total + 132, 260);

  button.style.setProperty("--angle", `${angle}deg`);
  button.style.setProperty("--radius", `${radius}px`);
  button.style.setProperty("--accent", node.color.accent);
  button.style.setProperty("--accent-glow", node.color.glow);
  button.style.setProperty("--delay", `${index * 70}ms`);
  button.dataset.type = node.type;
  button.dataset.nodeId = node.id;
  button.querySelector(".node-button__index").textContent = String(node.index).padStart(2, "0");
  button.querySelector(".node-button__name").textContent = node.name;
  button.querySelector(".node-button__hint").textContent = node.children.length
    ? `${node.children.length} ${node.children.length === 1 ? "item" : "items"}`
    : "Select";
  button.addEventListener("click", () => selectNode(node));

  return button;
}

function angleForPosition(index, total) {
  if (total <= 1) {
    return 0;
  }

  if (total === 2) {
    return index === 0 ? 180 : 0;
  }

  return (360 / total) * index - 90;
}

function selectNode(node) {
  if (!node.children.length) {
    activeElement = node;
    activePage = "behaviours";
    renderProgressNav(node);
    renderBehaviourScreen(node, selectedBehaviourId(node));
    persistSelection(node, selectedBehaviourId(node));
    renderActiveSession();
    return;
  }

  path = [...path, node];
  activeElement = null;
  activePage = "domains";
  persistSelection();
  renderProgressNav();
  renderLevel(node.children, node.name);
  renderActiveSession();
}

function renderBehaviourScreen(elementNode, requestedBehaviourId = null) {
  const isCompact = window.matchMedia("(max-width: 560px)").matches;
  const behaviours = elementNode.behaviours?.length ? elementNode.behaviours : [fallbackBehaviour(elementNode)];
  const selectedBehaviour = behaviours.find((behaviour) => behaviour.id === requestedBehaviourId) ?? behaviours[0];

  activeElement = elementNode;
  activePage = "behaviours";
  orbit.hidden = true;
  selectionCard.hidden = true;
  behaviourScreen.hidden = false;
  statementScreen.hidden = true;
  reviewScreen.hidden = true;
  behaviourScreen.style.setProperty("--accent", elementNode.color.accent);
  behaviourDetail.dataset.behaviourId = selectedBehaviour.id;
  behaviourDetail.querySelector("h2").textContent = selectedBehaviour.name;
  behaviourDetail.querySelector(".behaviour-detail__description").innerHTML = selectedBehaviour.description;
  behaviourOrbit.replaceChildren(...behaviours.map((behaviour, index) => {
    return createBehaviourButton(elementNode, behaviour, index, behaviours.length, behaviour.id === selectedBehaviour.id);
  }));
  behaviourDetail.onclick = () => {
    persistSelection(elementNode, selectedBehaviour.id, "statement");
    renderStatementScreen();
  };
  behaviourDetail.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      persistSelection(elementNode, selectedBehaviour.id, "statement");
      renderStatementScreen();
    }
  };

  behaviourScreen.animate(
    isCompact
      ? [
          { opacity: 0, transform: "translateY(18px) scale(0.96)" },
          { opacity: 1, transform: "translateY(0) scale(1)" }
        ]
      : [
          { opacity: 0, transform: "scale(0.9)" },
          { opacity: 1, transform: "scale(1)" }
        ],
    { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
  );
}

function createBehaviourButton(elementNode, behaviour, index, total, isSelected) {
  const button = document.createElement("button");
  const angle = total <= 1 ? -90 : -180 + (180 / (total - 1)) * index;
  const radius = clamp(300, 24 * total + 210, 320);
  const shadeProgress = total <= 1 ? 0 : index / (total - 1);
  const lightMix = `${Math.round(48 + shadeProgress * 44)}%`;
  const darkMix = `${Math.round(62 + shadeProgress * 35)}%`;

  button.className = "behaviour-button";
  button.type = "button";
  button.style.setProperty("--angle", `${angle}deg`);
  button.style.setProperty("--radius", `${radius}px`);
  button.style.setProperty("--delay", `${index * 55}ms`);
  button.style.setProperty("--mix-light", lightMix);
  button.style.setProperty("--mix-dark", darkMix);
  button.dataset.selected = String(isSelected);
  button.innerHTML = `
    <span>${String(behaviour.index).padStart(2, "0")}</span>
    <strong>${behaviour.name}</strong>
  `;
  button.addEventListener("click", () => {
    persistSelection(elementNode, behaviour.id);
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
  const hasDomain = Boolean(session?.domain);
  const hasSubDomain = Boolean(session?.subDomain);
  const hasElement = Boolean(elementNode ?? session?.elements?.length);
  const hasBehaviour = Boolean(session?.elements?.some((element) => element.behaviour));
  const hasStatement = Boolean(session?.pageIndex >= 4 || hasFormContent(session));
  const hasReview = Boolean(session?.pageIndex >= 5);
  const currentStep = currentStepId(elementNode);

  if (stepId === currentStep) {
    return { status: "current", canNavigate: true };
  }

  if (
    (stepId === "domains" && hasDomain) ||
    (stepId === "subdomains" && hasSubDomain) ||
    (stepId === "elements" && hasElement) ||
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

  const children = currentChildren();

  if (children.some((node) => node.type === "element")) {
    return "elements";
  }

  if (children.some((node) => node.type === "subdomain")) {
    return "subdomains";
  }

  return "domains";
}

function stepIdForNodes(nodes) {
  if (nodes.some((node) => node.type === "element")) {
    return "elements";
  }

  if (nodes.some((node) => node.type === "subdomain")) {
    return "subdomains";
  }

  return "domains";
}

function navigateToStep(stepId) {
  if (stepId === "domains") {
    goToDepth(0);
    return;
  }

  if (stepId === "subdomains" && path[0]?.children?.some((node) => node.type === "subdomain")) {
    goToDepth(1);
    return;
  }

  if (stepId === "elements") {
    goToDepth(elementDepth());
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

function elementDepth() {
  const subDomainIndex = path.findIndex((node) => node.type === "subdomain");
  return subDomainIndex >= 0 ? subDomainIndex + 1 : Math.min(path.length, 1);
}

function goToDepth(depth) {
  path = path.slice(0, depth);
  activeElement = null;
  activePage = stepIdForNodes(currentChildren());
  persistSelection();
  renderProgressNav();
  renderLevel(currentChildren(), currentLabel());
  renderActiveSession();
}

function renderStatementScreen() {
  const context = selectedContext();

  if (!context) {
    return;
  }

  activeElement = context.element;
  activePage = "statement";
  orbit.hidden = true;
  behaviourScreen.hidden = true;
  selectionCard.hidden = true;
  reviewScreen.hidden = true;
  statementScreen.hidden = false;
  persistSelection(context.element, context.behaviour.id, "statement");
  renderProgressNav(context.element);
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

      <section class="evidence-grid">
        <div class="evidence-panel">
          <h3>What you observed</h3>
          ${context.behaviour.description}
        </div>
        <div class="evidence-panel">
          <h3>What is likely to be the next step in learning progression</h3>
          ${context.nextBehaviour?.description ?? "<p>This is the final behaviour currently available for this element.</p>"}
        </div>
      </section>

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
    renderBehaviourScreen(context.element, context.behaviour.id);
    renderProgressNav(context.element);
  });
  statementScreen.querySelector("[data-action='next-review']").addEventListener("click", () => renderReviewScreen());
}

function renderReviewScreen() {
  const context = selectedContext();

  if (!context) {
    return;
  }

  activeElement = context.element;
  activePage = "review";
  orbit.hidden = true;
  behaviourScreen.hidden = true;
  selectionCard.hidden = true;
  statementScreen.hidden = true;
  reviewScreen.hidden = false;
  persistSelection(context.element, context.behaviour.id, "review");
  renderProgressNav(context.element);
  renderActiveSession();

  reviewScreen.innerHTML = `
    <article class="statement-card review-card">
      <p class="eyebrow">Final check</p>
      <h2>Review Statement</h2>

      ${fieldMarkup("student-name", "Student's name")}

      <dl class="review-list">
        <div><dt>Domain</dt><dd>${escapeHtml(context.domain.name)}</dd></div>
        <div><dt>Element</dt><dd>${escapeHtml(context.element.name)}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml(formValue("date") || "Not entered")}</dd></div>
        <div><dt>Observer</dt><dd>${escapeHtml(formValue("observer-name") || "Not entered")}</dd></div>
      </dl>

      <section class="summary-block">
        <h3>Learning domain summary</h3>
        <p>${escapeHtml(context.domain.summary ?? "Summary to be added.")}</p>
      </section>

      <section class="evidence-grid">
        <div class="evidence-panel">
          <h3>What you observed</h3>
          ${context.behaviour.description}
        </div>
        <div class="evidence-panel">
          <h3>Next step in learning progression</h3>
          ${context.nextBehaviour?.description ?? "<p>This is the final behaviour currently available for this element.</p>"}
        </div>
      </section>

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
  session.pageIndex = pageIndexFor(nextPage ?? (elementNode ? "behaviours" : currentStepId(null)));
  session.domain = path.find((node) => node.type === "domain")?.id ?? null;
  session.subDomain = path.find((node) => node.type === "subdomain")?.id ?? null;

  if (elementNode) {
    const fallbackId = elementNode.behaviours?.[0]?.id ?? null;
    const existingElement = session.elements.find((element) => element.id === elementNode.id);
    const nextElement = {
      id: elementNode.id,
      behaviour: behaviourId ?? existingElement?.behaviour ?? fallbackId
    };

    session.elements = [
      ...session.elements.filter((element) => element.id !== elementNode.id),
      nextElement
    ];
  }

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

function currentChildren() {
  return path.at(-1)?.children ?? rootNodes;
}

function currentLabel() {
  return path.at(-1)?.name ?? "Domains";
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
  return Boolean(session?.pageIndex && session.pageIndex > path.length && session.elements?.length);
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

function selectedContext() {
  const session = currentSession();
  const element = activeElement ?? lastSelectedElement(session);

  if (!session || !element) {
    return null;
  }

  path = pathForNode(element);
  const domain = path.find((node) => node.type === "domain") ?? rootNodes.find((node) => node.path[0] === element.path[0]);
  const subDomain = path.find((node) => node.type === "subdomain") ?? null;
  const behaviours = element.behaviours?.length ? element.behaviours : [fallbackBehaviour(element)];
  const behaviour = behaviours.find((item) => item.id === selectedBehaviourId(element)) ?? behaviours[0];
  const nextBehaviour = behaviours.find((item) => item.index === behaviour.index + 1) ?? null;

  return {
    domain,
    subDomain,
    element,
    behaviours,
    behaviour,
    nextBehaviour
  };
}

function pageForSession(session, resumedElement) {
  if (session?.pageIndex >= 5) {
    return "review";
  }

  if (session?.pageIndex >= 4) {
    return "statement";
  }

  if (resumedElement) {
    return "behaviours";
  }

  return stepIdForNodes(currentChildren());
}

function pageIndexFor(stepId) {
  const indexes = {
    domains: 0,
    subdomains: 1,
    elements: 2,
    behaviours: 3,
    statement: 4,
    review: 5
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
  if (session.pageIndex >= 5) {
    return "Resume review";
  }

  if (session.pageIndex >= 4) {
    return "Resume statement";
  }

  if (session.pageIndex && session.elements?.length) {
    return "Resume behaviour selection";
  }

  if (session.subDomain) {
    return "Resume subdomain";
  }

  if (session.domain) {
    return "Resume domain";
  }

  return "Start exploring";
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

