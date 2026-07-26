const loginForm = document.querySelector(".login-panel");
const contactForm = document.querySelector(".contact-form");
const contactNote = document.querySelector(".contact-note");
const dealTool = document.querySelector(".deal-tool");
const documentUpload = document.querySelector(".document-upload");
const uploadedFileName = document.querySelector(".uploaded-file-name");
const toolNote = document.querySelector(".tool-note");
const reportNote = document.querySelector(".report-note");
const downloadReportButton = document.querySelector(".download-report-button");
const runEvaluationButton = document.querySelector(".run-evaluation-button");
const reviseDocumentsButtons = document.querySelectorAll(".revise-documents-button");
const evaluationNote = document.querySelector(".evaluation-note");
const evaluationStatus = document.querySelector(".evaluation-status");
const dealScore = document.querySelector(".deal-score");
const scoreChange = document.querySelector(".score-change");
const findingsList = document.querySelector(".findings-list");
const historyList = document.querySelector(".history-list");
const documentList = document.querySelector(".document-list");
const documentCount = document.querySelector(".document-count");
const reportStatus = document.querySelector(".report-status");
const stripReportStatus = document.querySelector(".strip-report-status");
const riskCount = document.querySelector(".risk-count");
const onboardingForm = document.querySelector(".onboarding-form");
const onboardingNote = document.querySelector(".onboarding-note");
const onboardingBanners = document.querySelectorAll(".onboarding-banner");
const onboardingGatedForms = document.querySelectorAll(".onboarding-gated");
const onboardingCompleteActions = document.querySelectorAll(".onboarding-complete-action");
const signaturePad = document.querySelector(".signature-pad");
const clearSignatureButton = document.querySelector(".clear-signature-button");
const chatToggle = document.querySelector(".chat-toggle");
const chatPanel = document.querySelector(".chat-panel");
const chatClose = document.querySelector(".chat-close");
const chatMinimize = document.querySelector(".chat-minimize");
const chatMessages = document.querySelector(".chat-messages");
const chatForm = document.querySelector(".chat-form");
const chatInput = document.querySelector("#chat-input");
const chatSuggestions = document.querySelectorAll("[data-chat-question]");
const duplicateDealButton = document.querySelector(".duplicate-deal-button");
const uploadTriggerButton = document.querySelector(".upload-trigger-button");
const savedDealList = document.querySelector(".saved-deal-list");
const currentDealName = document.querySelector(".current-deal-name");
const currentDealAmount = document.querySelector(".current-deal-amount");
const currentDealInstrument = document.querySelector(".current-deal-instrument");
const currentDealDocs = document.querySelector(".current-deal-docs");
const createNewDealButton = document.querySelector(".create-new-deal-button");
const activeDealLabel = document.querySelector(".active-deal-label");
const evaluationProgress = document.querySelector(".evaluation-progress");
const progressRing = document.querySelector(".progress-ring");
const progressPercent = document.querySelector(".progress-percent");
const progressLabel = document.querySelector(".progress-label");
const evaluationDealAction = document.querySelector(".evaluation-deal-action");
const evaluationReviseAction = document.querySelector(".evaluation-revise-action");

let evaluationRun = 0;
let currentScore = null;
let documentRevision = 1;
let hasDrawnSignature = false;

restorePortalState();
applyOnboardingState();
initializeSignaturePad();
initializeChat();

loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  window.location.href = "dashboard.html";
});

contactForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const button = contactForm.querySelector("button");
  button.disabled = true;
  button.textContent = "Submitting...";
  contactNote.textContent = "Request received. Database connection will be added later.";

  setTimeout(() => {
    contactForm.reset();
    button.disabled = false;
    button.textContent = "Submit Request";
  }, 1600);
});

documentUpload?.addEventListener("change", () => {
  if (!isOnboardingComplete()) {
    renderDocumentList([]);
    updateText(toolNote, "Complete the client questionnaire before uploading deal documents.");
    documentUpload.value = "";
    return;
  }

  const files = Array.from(documentUpload.files || []);

  if (files.length > 20) {
    renderDocumentList([]);
    documentUpload.value = "";
    updateText(toolNote, "You can upload up to 20 documents for one deal. Select fewer files and try again.");
    updateText(documentCount, "0 Files");
    return;
  }

  if (files.length) {
    renderDocumentList(files);
    saveDocumentNames(files.map((file) => file.name));
    documentRevision += 1;
    updateText(toolNote, "Files attached to the current deal workspace. Save the deal before running evaluation.");
    updateText(evaluationNote, "Updated documents are ready for a new AI review.");
    updateText(evaluationStatus, "Documents Updated");
    updateText(documentCount, `${files.length} ${files.length === 1 ? "File" : "Files"}`);
    updateText(reportStatus, "Needs Review");
    updateText(stripReportStatus, "Needs Review");
  } else {
    renderDocumentList([]);
    updateText(documentCount, "0 Files");
  }
});

uploadTriggerButton?.addEventListener("click", () => {
  documentUpload?.click();
});

createNewDealButton?.addEventListener("click", () => {
  startNewDealDraft();
});

dealTool?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!isOnboardingComplete()) {
    updateText(toolNote, "Complete the client questionnaire before saving deal documents.");
    return;
  }

  const button = dealTool.querySelector("button[type='submit']");
  const deal = saveDealWorkspace(false);

  if (!deal) {
    return;
  }

  button.disabled = true;
  button.textContent = "Saving...";
  updateText(toolNote, `${deal.name} saved. You can now run the evaluation separately.`);
  updateText(evaluationStatus, "Ready");

  setTimeout(() => {
    button.disabled = false;
    button.textContent = "Save Deal Workspace";
    window.location.href = "portal-evaluation.html";
  }, 700);
});

duplicateDealButton?.addEventListener("click", () => {
  if (!isOnboardingComplete()) {
    updateText(toolNote, "Complete the client questionnaire before saving a deal revision.");
    return;
  }

  const deal = saveDealWorkspace(true);
  if (!deal) {
    return;
  }
  updateText(toolNote, `${deal.name} saved as Revision ${deal.revision}.`);
});

runEvaluationButton?.addEventListener("click", () => {
  if (!isOnboardingComplete()) {
    evaluationNote.textContent = "Complete the client questionnaire before running an evaluation.";
    evaluationStatus.textContent = "Questionnaire Required";
    setTimeout(() => {
      window.location.href = "onboarding.html";
    }, 900);
    return;
  }

  const activeDeal = getActiveDeal();
  const files = activeDeal?.documents || getSavedDocumentNames();

  if (!activeDeal) {
    updateText(evaluationNote, "Create and save a named deal workspace before running an evaluation.");
    updateText(evaluationStatus, "Deal Required");
    setTimeout(() => {
      window.location.href = "portal-assets.html";
    }, 900);
    return;
  }

  if (!files.length) {
    updateText(evaluationNote, "Upload at least one document before running the evaluation.");
    updateText(evaluationStatus, "Documents Required");
    setTimeout(() => {
      window.location.href = "portal-assets.html";
    }, 900);
    return;
  }

  const previousScore = currentScore;

  runEvaluationButton.disabled = true;
  runEvaluationButton.textContent = "Evaluating...";
  updateText(evaluationStatus, "Running");
  updateText(evaluationNote, `Reviewing ${activeDeal.name} against trade finance readiness criteria.`);
  startEvaluationProgress();

  setTimeout(() => {
    evaluationRun += 1;
    currentScore = calculateScore(previousScore, activeDeal);
    updateEvaluationReport(previousScore, currentScore, activeDeal);
    completeEvaluationProgress();

    runEvaluationButton.disabled = false;
    runEvaluationButton.textContent = "Run Evaluation Again";
    updateText(evaluationStatus, "Complete");
    updateText(evaluationNote, "Evaluation complete. Score, findings, and deal history were refreshed.");
  }, 900);
});

reviseDocumentsButtons.forEach((button) => {
  button.addEventListener("click", () => {
    documentUpload?.click();
  });
});

savedDealList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-deal-action]");

  if (!button) {
    return;
  }

  const deal = getDeals().find((item) => item.id === button.dataset.dealId);

  if (!deal) {
    return;
  }

  localStorage.setItem("nfelActiveDealId", deal.id);
  populateDealForm(deal);
  renderDocumentList(deal.documents || []);
  renderSavedDeals();
  updateEvaluationDealSummary(deal);
  updateText(activeDealLabel, `Revision ${deal.revision || 1}`);

  if (button.dataset.dealAction === "revision") {
    const revised = saveDealWorkspace(true, deal);
    if (!revised) {
      return;
    }
    updateText(toolNote, `${revised.name} copied into Revision ${revised.revision}. Update details or documents before evaluation.`);
  } else {
    updateText(toolNote, `${deal.name} loaded. You can modify any field, replace files, and save again.`);
  }
});

downloadReportButton?.addEventListener("click", () => {
  reportNote.textContent = "Opening print dialog. Choose Save as PDF to download the report.";
  window.print();
});

onboardingForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!hasDrawnSignature) {
    updateText(onboardingNote, "Draw your signature before saving the questionnaire.");
    return;
  }

  const formData = new FormData(onboardingForm);
  const payload = Object.fromEntries(formData.entries());
  payload.privacy_acknowledgment = formData.has("privacy_acknowledgment");
  payload.truth_certification = formData.has("truth_certification");
  payload.completed_at = new Date().toISOString();
  payload.confirmation_id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `confirmation-${Date.now()}`;
  payload.signature_image = signaturePad?.toDataURL("image/png") || "";

  localStorage.setItem("nfelOnboardingComplete", "true");
  localStorage.setItem("nfelOnboardingPayload", JSON.stringify(payload));
  localStorage.setItem(
    "nfelOnboardingConfirmation",
    JSON.stringify({
      confirmation_id: payload.confirmation_id,
      signature_type: "drawn_signature",
      signature_image: payload.signature_image,
      signed_at: payload.completed_at,
      consent_version: "kyc-risk-profile-2026-v1",
      status: "submitted",
    })
  );

  updateText(onboardingNote, "Questionnaire saved. You can now submit assets for review.");

  setTimeout(() => {
    window.location.href = "portal-assets.html";
  }, 900);
});

function calculateScore(previousScore, deal = getActiveDeal()) {
  const fileNames = deal?.documents || getSavedDocumentNames();
  const notes = String(deal?.notes || localStorage.getItem("nfelDealNotes") || dealTool?.elements.deal_notes?.value || "").trim();
  const completedFields = [
    deal?.name,
    deal?.type,
    deal?.amount,
    deal?.buyer,
    deal?.seller,
    deal?.origin_country,
    deal?.destination_country,
    deal?.payment_terms,
    deal?.instrument,
    deal?.incoterms,
    deal?.closing_date,
  ].filter(Boolean).length;
  const checklistImpact = Object.values(deal?.documentChecklist || {}).filter(Boolean).length * 2;
  const fileImpact = Math.min(fileNames.length * 3, 12);
  const fieldImpact = Math.min(completedFields * 2, 16);
  const notesImpact = notes.length > 80 ? 5 : notes.length > 20 ? 2 : -1;
  const revisionImpact = documentRevision % 2 === 0 ? 4 : -2;
  const baseScore = previousScore ?? 70;
  const nextScore = baseScore + fileImpact + fieldImpact + checklistImpact + notesImpact + revisionImpact - 18;

  return Math.max(61, Math.min(96, nextScore));
}

function updateEvaluationReport(previousScore, nextScore, deal = getActiveDeal()) {
  const hasPreviousScore = typeof previousScore === "number";
  const delta = hasPreviousScore ? nextScore - previousScore : 0;
  const direction = delta > 0 ? "increased" : delta < 0 ? "decreased" : "held";
  const displayDelta = delta > 0 ? `+${delta}` : String(delta);

  if (dealScore) {
    dealScore.textContent = `${nextScore}%`;
  }

  if (scoreChange) {
    scoreChange.textContent = hasPreviousScore
      ? `${deal?.name || "Current deal"} score ${direction} from ${previousScore}% to ${nextScore}% after Run ${evaluationRun}. Change: ${displayDelta} points.`
      : `Initial evaluation for ${deal?.name || "the current deal"} generated a ${nextScore}% readiness score. Update the deal or documents and rerun to compare movement.`;
  }

  if (findingsList) {
    findingsList.innerHTML = getFindings(nextScore, deal)
      .map((finding) => `<li>${finding}</li>`)
      .join("");
  }

  if (historyList) {
    historyList.querySelector(".empty-history")?.remove();
    const historyItem = document.createElement("p");
    historyItem.innerHTML = hasPreviousScore
      ? `<strong>${escapeHtml(deal?.name || "Current Deal")} - Run ${evaluationRun}</strong><span>${nextScore}% score, ${displayDelta} point change</span>`
      : `<strong>${escapeHtml(deal?.name || "Current Deal")} - Run ${evaluationRun}</strong><span>${nextScore}% initial score</span>`;
    historyList.prepend(historyItem);
    localStorage.setItem(getDealHistoryKey(deal), historyList.innerHTML);
  }

  updateText(reportStatus, "Ready");
  updateText(stripReportStatus, "Export Ready");
  updateText(riskCount, nextScore >= 88 ? "1 Open" : nextScore >= 76 ? "3 Open" : "5 Open");
  localStorage.setItem("nfelCurrentScore", String(nextScore));
  localStorage.setItem("nfelEvaluationRun", String(evaluationRun));
  localStorage.setItem("nfelReportStatus", "Ready");

  if (deal) {
    const deals = getDeals().map((item) =>
      item.id === deal.id
        ? {
            ...item,
            score: nextScore,
            evaluation_run: evaluationRun,
            report_status: "Ready",
            evaluated_at: new Date().toISOString(),
          }
        : item
    );
    saveDeals(deals);
    renderSavedDeals();
  }
}

function renderDocumentList(files) {
  if (!documentList) {
    return;
  }

  if (!files.length) {
    documentList.innerHTML = '<p class="empty-documents"><strong>No documents uploaded yet</strong><span>Awaiting files</span></p>';
    return;
  }

  documentList.innerHTML = files
    .map((file) => `<p><strong>${escapeHtml(file.name || file)}</strong><span>Uploaded</span></p>`)
    .join("");
}

function startNewDealDraft() {
  localStorage.removeItem("nfelActiveDealId");
  localStorage.removeItem("nfelDocumentNames");
  localStorage.removeItem("nfelDealNotes");
  localStorage.setItem("nfelReportStatus", "Draft");

  if (dealTool) {
    dealTool.reset();
  }

  if (documentUpload) {
    documentUpload.value = "";
  }

  currentScore = null;
  evaluationRun = 0;
  documentRevision += 1;
  renderDocumentList([]);
  renderSavedDeals();
  updateEvaluationDealSummary(null);
  updateText(activeDealLabel, "New Draft");
  updateText(toolNote, "New deal draft started. Add a deal name, upload up to 20 documents, then save the workspace.");
}

function collectDealFromForm(sourceDeal = null) {
  const formData = new FormData(dealTool);
  const files = Array.from(documentUpload?.files || []);
  const previousDocuments = sourceDeal?.documents || getActiveDeal()?.documents || getSavedDocumentNames();
  const documents = files.length ? files.map((file) => file.name) : previousDocuments;
  const checklistKeys = ["doc_purchase_order", "doc_invoice", "doc_financials", "doc_kyc", "doc_logistics", "doc_instrument"];
  const valueFor = (name, fallback = "") => (dealTool?.elements[name] ? String(formData.get(name) || "").trim() : fallback);

  return {
    id: sourceDeal?.id || localStorage.getItem("nfelActiveDealId") || createId("deal"),
    name: valueFor("deal_name", sourceDeal?.name || "Untitled Trade Finance Deal") || "Untitled Trade Finance Deal",
    type: valueFor("deal_type", sourceDeal?.type || "Trade finance") || "Trade finance",
    amount: valueFor("deal_amount", sourceDeal?.amount || ""),
    currency: valueFor("deal_currency", sourceDeal?.currency || "USD") || "USD",
    buyer: valueFor("buyer", sourceDeal?.buyer || ""),
    seller: valueFor("seller", sourceDeal?.seller || ""),
    origin_country: valueFor("origin_country", sourceDeal?.origin_country || ""),
    destination_country: valueFor("destination_country", sourceDeal?.destination_country || ""),
    payment_terms: valueFor("payment_terms", sourceDeal?.payment_terms || ""),
    instrument: valueFor("instrument", sourceDeal?.instrument || "To be determined") || "To be determined",
    incoterms: valueFor("incoterms", sourceDeal?.incoterms || ""),
    closing_date: valueFor("closing_date", sourceDeal?.closing_date || ""),
    notes: valueFor("deal_notes", sourceDeal?.notes || ""),
    documentChecklist: checklistKeys.reduce((result, key) => ({ ...result, [key]: formData.has(key) }), {}),
    documents,
    revision: sourceDeal?.revision || getActiveDeal()?.revision || 1,
    updated_at: new Date().toISOString(),
  };
}

function saveDealWorkspace(asRevision = false, sourceDeal = null) {
  const existing = sourceDeal || getActiveDeal();
  const selectedFiles = Array.from(documentUpload?.files || []);

  if (selectedFiles.length > 20) {
    updateText(toolNote, "You can upload up to 20 documents for one deal. Select fewer files and try again.");
    return null;
  }

  const deal = collectDealFromForm(existing);

  if (asRevision) {
    deal.id = createId("deal");
    deal.revision = (existing?.revision || deal.revision || 1) + 1;
    deal.score = null;
    deal.evaluation_run = 0;
    deal.report_status = "Needs Review";
  }

  const deals = getDeals().filter((item) => item.id !== deal.id);
  deals.unshift(deal);
  saveDeals(deals);
  localStorage.setItem("nfelActiveDealId", deal.id);
  saveDocumentNames(deal.documents || []);
  localStorage.setItem("nfelDealNotes", deal.notes || "");
  localStorage.setItem("nfelReportStatus", "Needs Review");
  updateText(activeDealLabel, `Revision ${deal.revision || 1}`);
  renderSavedDeals();
  updateEvaluationDealSummary(deal);
  return deal;
}

function populateDealForm(deal) {
  if (!dealTool || !deal) {
    return;
  }

  const fields = ["deal_name", "deal_type", "deal_amount", "deal_currency", "buyer", "seller", "origin_country", "destination_country", "payment_terms", "instrument", "incoterms", "closing_date", "deal_notes"];
  fields.forEach((name) => {
    if (dealTool.elements[name]) {
      dealTool.elements[name].value = deal[name.replace("deal_", "")] || deal[name] || "";
    }
  });

  Object.entries(deal.documentChecklist || {}).forEach(([key, value]) => {
    if (dealTool.elements[key]) {
      dealTool.elements[key].checked = Boolean(value);
    }
  });
}

function renderSavedDeals() {
  if (!savedDealList) {
    return;
  }

  const activeId = localStorage.getItem("nfelActiveDealId");
  const deals = getDeals();

  if (!deals.length) {
    savedDealList.innerHTML = '<p class="empty-deals"><strong>No saved deals yet</strong><span>Save a deal workspace to create the first record</span></p>';
    return;
  }

  savedDealList.innerHTML = deals
    .map((deal) => {
      const docs = deal.documents?.length || 0;
      const scoreLabel = deal.score ? `${deal.score}%` : "--";
      const status = deal.score ? "Evaluated" : deal.report_status || "Needs Review";
      const active = deal.id === activeId ? " is-active" : "";
      return `<article class="saved-deal${active}"><div><span>Revision ${escapeHtml(deal.revision || 1)}</span><strong>${escapeHtml(deal.name)}</strong><p>${escapeHtml(deal.type || "Trade finance")} | ${escapeHtml(deal.amount || "Amount not set")} | ${docs} ${docs === 1 ? "file" : "files"} | ${escapeHtml(status)}</p></div><div class="deal-score-badge"><small>Score</small><strong>${escapeHtml(scoreLabel)}</strong></div><div><button class="button secondary" type="button" data-deal-action="load" data-deal-id="${escapeHtml(deal.id)}">Load</button><button class="button secondary" type="button" data-deal-action="revision" data-deal-id="${escapeHtml(deal.id)}">New Revision</button></div></article>`;
    })
    .join("");
}

function updateEvaluationDealSummary(deal) {
  updateText(currentDealName, deal?.name || "No deal selected");
  updateText(currentDealAmount, deal?.amount || "--");
  updateText(currentDealInstrument, deal?.instrument || "--");
  updateText(currentDealDocs, `${deal?.documents?.length || 0} ${deal?.documents?.length === 1 ? "File" : "Files"}`);
  updateText(evaluationDealAction, deal ? "Change Deal" : "Create Deal");
  updateText(evaluationReviseAction, deal ? "Revise Deal" : "Create Deal First");

  if (runEvaluationButton) {
    runEvaluationButton.textContent = deal ? "Run Evaluation" : "Create Deal First";
  }
}

function setEvaluationProgress(value, label) {
  if (!evaluationProgress || !progressRing || !progressPercent) {
    return;
  }

  const percent = Math.max(0, Math.min(100, value));
  evaluationProgress.classList.remove("is-hidden");
  progressRing.style.setProperty("--progress", percent);
  progressPercent.textContent = `${percent}%`;
  updateText(progressLabel, label);
}

function startEvaluationProgress() {
  setEvaluationProgress(12, "Preparing files");

  setTimeout(() => setEvaluationProgress(36, "Reading deal package"), 180);
  setTimeout(() => setEvaluationProgress(62, "Checking trade finance terms"), 420);
  setTimeout(() => setEvaluationProgress(84, "Scoring readiness"), 680);
}

function completeEvaluationProgress() {
  setEvaluationProgress(100, "Review complete");
}

function getActiveDeal() {
  const activeId = localStorage.getItem("nfelActiveDealId");
  return getDeals().find((deal) => deal.id === activeId) || null;
}

function getDeals() {
  try {
    return JSON.parse(localStorage.getItem("nfelDeals") || "[]");
  } catch {
    return [];
  }
}

function saveDeals(deals) {
  localStorage.setItem("nfelDeals", JSON.stringify(deals));
}

function getDealHistoryKey(deal) {
  return `nfelEvaluationHistory:${deal?.id || "default"}`;
}

function createId(prefix) {
  return window.crypto?.randomUUID ? `${prefix}-${window.crypto.randomUUID()}` : `${prefix}-${Date.now()}`;
}

function restorePortalState() {
  const activeDeal = getActiveDeal();
  const savedNames = activeDeal?.documents || getSavedDocumentNames();
  const savedScore = activeDeal?.score || localStorage.getItem("nfelCurrentScore");
  const savedRun = activeDeal?.evaluation_run || localStorage.getItem("nfelEvaluationRun");
  const savedHistory = activeDeal ? localStorage.getItem(getDealHistoryKey(activeDeal)) : localStorage.getItem("nfelEvaluationHistory");

  populateDealForm(activeDeal);
  renderSavedDeals();
  updateEvaluationDealSummary(activeDeal);
  updateText(activeDealLabel, activeDeal ? `Revision ${activeDeal.revision || 1}` : "New Draft");

  if (savedNames.length) {
    renderDocumentList(savedNames);
    updateText(documentCount, `${savedNames.length} ${savedNames.length === 1 ? "File" : "Files"}`);
    updateText(reportStatus, localStorage.getItem("nfelReportStatus") || "Needs Review");
    updateText(stripReportStatus, localStorage.getItem("nfelReportStatus") || "Needs Review");
  }

  if (savedScore) {
    currentScore = Number(savedScore);
    updateText(dealScore, `${currentScore}%`);
    updateText(scoreChange, `Latest evaluation score for ${activeDeal?.name || "the current deal"} is ${currentScore}%. Update the deal or documents and rerun to compare movement.`);
    updateText(reportStatus, "Ready");
    updateText(stripReportStatus, "Ready");
    updateText(riskCount, currentScore >= 88 ? "1 Open" : currentScore >= 76 ? "3 Open" : "5 Open");
  }

  if (savedRun) {
    evaluationRun = Number(savedRun);
  }

  if (savedHistory && historyList) {
    historyList.innerHTML = savedHistory;
  }
}

function applyOnboardingState() {
  const complete = isOnboardingComplete();

  onboardingBanners.forEach((banner) => {
    banner.classList.toggle("is-hidden", complete);
  });

  onboardingCompleteActions.forEach((action) => {
    action.classList.toggle("is-hidden", !complete);
  });

  onboardingGatedForms.forEach((form) => {
    const isDealWorkspace = form.classList.contains("deal-tool");

    if (isDealWorkspace) {
      form.classList.remove("is-disabled");
      form.querySelectorAll("input, select, textarea, button").forEach((field) => {
        field.disabled = false;
      });
      return;
    }

    form.classList.toggle("is-disabled", !complete);
    form.querySelectorAll("input, select, textarea, button").forEach((field) => {
      field.disabled = !complete;
    });
  });

  if (!complete && document.querySelector(".onboarding-gated")) {
    updateText(toolNote, "You can draft deal details now. Complete the questionnaire before submitting documents or running evaluation.");
  }
}

function isOnboardingComplete() {
  return localStorage.getItem("nfelOnboardingComplete") === "true";
}

function initializeSignaturePad() {
  if (!signaturePad) {
    return;
  }

  const context = signaturePad.getContext("2d");
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.strokeStyle = "#1b2228";

  let isDrawing = false;

  const getPoint = (event) => {
    const rect = signaturePad.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {
      x: ((source.clientX - rect.left) / rect.width) * signaturePad.width,
      y: ((source.clientY - rect.top) / rect.height) * signaturePad.height,
    };
  };

  const startDrawing = (event) => {
    event.preventDefault();
    isDrawing = true;
    hasDrawnSignature = true;
    const point = getPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const draw = (event) => {
    if (!isDrawing) {
      return;
    }

    event.preventDefault();
    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = () => {
    isDrawing = false;
  };

  signaturePad.addEventListener("mousedown", startDrawing);
  signaturePad.addEventListener("mousemove", draw);
  window.addEventListener("mouseup", stopDrawing);
  signaturePad.addEventListener("touchstart", startDrawing, { passive: false });
  signaturePad.addEventListener("touchmove", draw, { passive: false });
  window.addEventListener("touchend", stopDrawing);

  clearSignatureButton?.addEventListener("click", () => {
    context.clearRect(0, 0, signaturePad.width, signaturePad.height);
    hasDrawnSignature = false;
    updateText(onboardingNote, "");
  });
}

function initializeChat() {
  if (!chatToggle || !chatPanel || !chatMessages) {
    return;
  }

  let hasGreeted = false;

  const openChat = () => {
    chatPanel.classList.remove("is-hidden");
    chatToggle.classList.add("is-open");
    chatToggle.setAttribute("aria-expanded", "true");

    if (!hasGreeted) {
      addChatMessage("bot", `${getTimeGreeting()} I can help you find services, FAQ answers, client portal access, or the consultation form.`);
      hasGreeted = true;
    }

    chatInput?.focus();
  };

  const closeChat = () => {
    chatPanel.classList.add("is-hidden");
    chatToggle.classList.remove("is-open");
    chatToggle.setAttribute("aria-expanded", "false");
  };

  chatToggle.addEventListener("click", () => {
    if (chatPanel.classList.contains("is-hidden")) {
      openChat();
    } else {
      closeChat();
    }
  });

  chatClose?.addEventListener("click", closeChat);
  chatMinimize?.addEventListener("click", closeChat);

  chatSuggestions.forEach((button) => {
    button.addEventListener("click", () => {
      openChat();
      handleChatQuestion(button.dataset.chatQuestion || "");
    });
  });

  chatForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = chatInput?.value.trim() || "";

    if (!question) {
      return;
    }

    handleChatQuestion(question);
    chatInput.value = "";
  });
}

function handleChatQuestion(question) {
  addChatMessage("user", question);
  addChatMessage("bot", getChatResponse(question));
}

function addChatMessage(type, content) {
  const message = document.createElement("div");
  message.className = `chat-message ${type}`;

  if (type === "bot") {
    message.innerHTML = content;
  } else {
    message.textContent = content;
  }

  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getTimeGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning.";
  }

  if (hour < 17) {
    return "Good afternoon.";
  }

  return "Good evening.";
}

function getChatResponse(question) {
  const normalized = normalizeChatText(question);

  const intents = [
    {
      name: "greeting",
      weight: 0,
      terms: ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"],
      response: `${getTimeGreeting()} You are connected with the N.F.EL concierge. I can help with trade finance services, credit enhancement, onboarding, the client portal, or scheduling a confidential consultation. What would you like to do first?`,
    },
    {
      name: "services",
      weight: 0,
      terms: ["service", "services", "what do you do", "offer", "help with", "trade finance", "import", "export", "banking", "wealth", "capital", "treasury", "letter of credit", "standby"],
      response: 'N.F.EL supports trade finance advisory, commercial banking strategy, wealth and owner planning, strategic alliances, and credit enhancement structures. For a clean overview, start here: <a href="services.html">View Services</a>. If you already have a transaction in mind, use <a href="#contact">Schedule Consultation</a>.',
    },
    {
      name: "credit-enhancement",
      weight: 0,
      terms: ["credit enhancement", "proof of funds", "pof", "sblc", "standby letter", "bank instrument", "collateral", "balance sheet", "enhancement", "funding conversations"],
      response: 'Credit enhancement support is for clients preparing proof-of-funds, balance-sheet positioning, or commercial funding conversations. N.F.EL can help organize the structure, required documentation, and readiness narrative. <a href="services.html">Review Credit Enhancement Services</a> or <a href="#contact">request a consultation</a>.',
    },
    {
      name: "portal",
      weight: 0,
      terms: ["login", "log in", "portal", "client portal", "dashboard", "account", "my account", "customer", "client access"],
      response: 'Active clients can use the portal to manage account information, messages, submitted assets, and AI deal evaluations. For this prototype, clicking login opens the dashboard without connecting Firebase yet. <a href="login.html">Go to Client Login</a>.',
    },
    {
      name: "onboarding",
      weight: 0,
      terms: ["onboard", "onboarding", "questionnaire", "kyc", "risk assessment", "application", "signature", "sign", "verification"],
      response: 'Before a client submits a deal, the onboarding questionnaire must be completed. It captures client identity, business details, banking context, risk profile, acknowledgments, and a drawn signature confirmation. <a href="login.html">Enter Client Portal</a> to complete it.',
    },
    {
      name: "evaluation",
      weight: 0,
      terms: ["evaluation", "evaluate", "ai", "deal", "review", "score", "report", "pdf", "documents", "upload", "assets", "submit for review"],
      response: 'The AI deal review workflow is inside the client portal. Clients upload deal documents under My Assets, run an evaluation separately, review score changes after revisions, and export the findings as a PDF. <a href="login.html">Open Client Portal</a>.',
    },
    {
      name: "faq",
      weight: 0,
      terms: ["faq", "faqs", "question", "questions", "answers", "learn more"],
      response: 'The FAQ covers services, onboarding requirements, the client portal, document review, and how consultations begin. <a href="faq.html">Open FAQ</a>.',
    },
    {
      name: "contact",
      weight: 0,
      terms: ["contact", "consult", "consultation", "schedule", "call", "meeting", "introduction", "intro", "speak", "talk", "email"],
      response: 'For a confidential consultation, share the opportunity, transaction type, or alliance objective in the contact form. <a href="#contact">Go to Contact</a>.',
    },
    {
      name: "approach",
      weight: 0,
      terms: ["approach", "process", "how it works", "steps", "method", "strategy", "execution"],
      response: 'The engagement process starts with assessment, then documentation and positioning, then execution support. You can review the full process here: <a href="approach.html">View Approach</a>.',
    },
  ];

  intents.forEach((intent) => {
    intent.weight = scoreChatIntent(normalized, intent.terms);
  });

  const bestIntent = intents.sort((first, second) => second.weight - first.weight)[0];

  if (bestIntent && bestIntent.weight > 0) {
    return bestIntent.response;
  }

  if (normalized.length < 18) {
    return 'I can help route you quickly. Are you looking for <a href="services.html">services</a>, <a href="login.html">client portal access</a>, <a href="faq.html">FAQ</a>, or a <a href="#contact">consultation</a>?';
  }

  return 'I may need one more detail to point you to the right place. If this is about a transaction, I can help with services or consultation. If you are already a client, I can send you to the portal for onboarding, assets, evaluations, messages, and account access. <a href="services.html">Services</a> | <a href="login.html">Client Portal</a> | <a href="#contact">Contact</a>';
}

function normalizeChatText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreChatIntent(normalized, terms) {
  return terms.reduce((score, term) => {
    if (normalized === term) {
      return score + 6;
    }

    if (normalized.includes(term)) {
      return score + Math.max(2, term.split(" ").length + 1);
    }

    return score;
  }, 0);
}

function saveDocumentNames(names) {
  localStorage.setItem("nfelDocumentNames", JSON.stringify(names));
}

function getSavedDocumentNames() {
  try {
    return JSON.parse(localStorage.getItem("nfelDocumentNames") || "[]");
  } catch {
    return [];
  }
}

function updateText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFindings(score) {
  if (score >= 88) {
    return [
      "Document package is substantially stronger for lender and working-capital review.",
      "Use-of-funds, repayment support, and receivables detail are now clearer.",
      "Remaining review should focus on counterparty, country, and currency exposure.",
      "Recommended next step is advisory review before external banking conversations.",
    ];
  }

  if (score >= 76) {
    return [
      "Transaction purpose is clear, but use-of-funds details should be tightened.",
      "Receivables documentation appears useful for lender and working-capital review.",
      "Counterparty, country, currency, and repayment risks need more detail.",
      "Recommended next step is a documentation review before outside banking conversations.",
    ];
  }

  return [
    "Deal package needs stronger transaction summary and source-of-repayment support.",
    "Financial documents should be organized before lender or partner presentation.",
    "Trade corridor, counterparty, and currency assumptions need clearer documentation.",
    "Recommended next step is revising documents and rerunning the AI evaluation.",
  ];
}
