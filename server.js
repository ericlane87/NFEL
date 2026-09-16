const http = require("http");
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

loadLocalEnv();

const port = Number(process.env.PORT || 4000);
const root = __dirname;
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-5";
const maxUploadBytes = 24 * 1024 * 1024;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || "nfel-tradefinance-portal";
const firestore = initializeFirebaseAdmin();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const evaluationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    readiness_score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    key_findings: {
      type: "array",
      minItems: 4,
      maxItems: 6,
      items: { type: "string" },
    },
    risk_flags: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" },
    },
    recommended_next_steps: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" },
    },
    missing_form_fields: {
      type: "array",
      minItems: 0,
      maxItems: 10,
      items: { type: "string" },
    },
    missing_documents: {
      type: "array",
      minItems: 0,
      maxItems: 10,
      items: { type: "string" },
    },
  },
  required: ["readiness_score", "summary", "key_findings", "risk_flags", "recommended_next_steps", "missing_form_fields", "missing_documents"],
};

const kycEvaluationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    package_status: {
      type: "string",
      enum: ["ready_for_review", "needs_review", "missing_required_items"],
    },
    readiness_score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    document_checks: {
      type: "array",
      minItems: 2,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          document_name: { type: "string" },
          expected_document_type: { type: "string" },
          appears_to_match: { type: "boolean" },
          notes: { type: "string" },
        },
        required: ["document_name", "expected_document_type", "appears_to_match", "notes"],
      },
    },
    questionnaire_checks: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: { type: "string" },
    },
    missing_or_unclear_items: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" },
    },
    recommended_next_steps: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: { type: "string" },
    },
  },
  required: ["package_status", "readiness_score", "summary", "document_checks", "questionnaire_checks", "missing_or_unclear_items", "recommended_next_steps"],
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/evaluate-deal") {
      await handleEvaluation(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/save-deal-documents") {
      await handleDocumentSave(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/save-kyc-documents") {
      await handleKycDocumentSave(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/evaluate-kyc") {
      await handleKycEvaluation(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/deals") {
      await handleDealList(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/profile") {
      await handleProfile(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/firebase-config.js") {
      serveFirebaseConfig(res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: error.message || "Server error" });
  }
});

server.listen(port, () => {
  console.log(`N.F.EL portal running at http://localhost:${port}`);
});

function initializeFirebaseAdmin() {
  if (admin.apps.length) {
    return admin.firestore();
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  let credential = null;

  if (serviceAccountJson || serviceAccountBase64) {
    const rawAccount = serviceAccountJson || Buffer.from(serviceAccountBase64, "base64").toString("utf8");
    credential = admin.credential.cert(JSON.parse(rawAccount));
  }

  admin.initializeApp({
    credential: credential || admin.credential.applicationDefault(),
    projectId: firebaseProjectId,
  });

  return admin.firestore();
}

async function requireFirebaseUser(req, res) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    sendJson(res, 401, { error: "Sign in before submitting documents for AI review." });
    return null;
  }

  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (error) {
    console.error("Firebase token verification failed:", error.message);
    sendJson(res, 401, { error: "Your secure session expired. Sign in again." });
    return null;
  }
}

async function handleEvaluation(req, res) {
  if (!apiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is not configured on the server." });
    return;
  }

  const user = await requireFirebaseUser(req, res);
  if (!user) {
    return;
  }

  const payload = await readJson(req, maxUploadBytes);
  const deal = sanitizeDeal(payload?.deal);
  const dealDocuments = sanitizeUploadedDocuments(payload?.documents, 20);
  await ensureUserProfile(user);

  deal.name = deal.name || "Untitled Deal";

  const content = [
    {
      type: "input_text",
      text: `Evaluate this submitted deal using all field selections, checklist selections, filenames, and attached document contents. In missing_form_fields, list the exact portal field labels that should be completed to improve the score. In missing_documents, list the exact document types that should be uploaded or checked off to improve the score. Return only the requested JSON.\n\n${JSON.stringify(deal, null, 2)}`,
    },
    ...dealDocuments.map((document) => ({
      type: "input_file",
      filename: document.name,
      file_data: `data:${document.type || "application/octet-stream"};base64,${document.data}`,
    })),
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "You evaluate trade finance deal readiness for an advisory portal. Be practical, concise, and avoid legal, tax, or final credit approval language. Privacy rule: never repeat a real beneficiary/client name; refer to any beneficiary only as ABC client. If source text says in favour of or in favor of a person/company, write in favour of ABC client instead.",
        },
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "deal_evaluation",
          strict: true,
          schema: evaluationSchema,
        },
      },
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    sendJson(res, response.status, {
      error: body?.error?.message || "OpenAI evaluation failed.",
    });
    return;
  }

  const evaluation = parseOpenAiJson(body, "OpenAI returned an unreadable evaluation.");

  if (evaluation.error) {
    sendJson(res, evaluation.status, { error: evaluation.error });
    return;
  }

  const saved = await saveDealEvaluation(user.uid, deal, evaluation.data, dealDocuments);
  sendJson(res, 200, {
    ...evaluation.data,
    saved_record: saved,
  });
}

async function handleKycEvaluation(req, res) {
  if (!apiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is not configured on the server." });
    return;
  }

  const user = await requireFirebaseUser(req, res);
  if (!user) {
    return;
  }

  const payload = await readJson(req, maxUploadBytes);
  const questionnaire = sanitizeQuestionnaire(payload?.questionnaire);
  const kycDocuments = sanitizeUploadedDocuments(payload?.documents, 10);
  await ensureUserProfile(user);

  if (!questionnaire?.full_name) {
    sendJson(res, 400, { error: "A completed questionnaire is required before KYC evaluation." });
    return;
  }

  if (kycDocuments.length < 2) {
    sendJson(res, 400, { error: "The KYC folder must contain the required RWA/MT799 and MT760 documents." });
    return;
  }

  const content = [
    {
      type: "input_text",
      text: `Evaluate this KYC onboarding package. Confirm whether the questionnaire is complete enough for advisory review and whether the attached documents appear to be the required RWA/MT799 and draft MT760 documents. Do not provide legal, banking approval, sanctions, or compliance certification. Return only the requested JSON.\n\nQuestionnaire:\n${JSON.stringify(questionnaire, null, 2)}`,
    },
    ...kycDocuments.map((document) => ({
      type: "input_file",
      filename: document.name,
      file_data: `data:${document.type || "application/octet-stream"};base64,${document.data}`,
    })),
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "You review KYC onboarding packages for an advisory portal. Be precise, practical, and flag missing or unclear items. You do not certify authenticity, legal compliance, bank validity, or transaction approval. Privacy rule: never repeat a real beneficiary/client name; refer to any beneficiary only as ABC client. If source text says in favour of or in favor of a person/company, write in favour of ABC client instead.",
        },
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "kyc_package_evaluation",
          strict: true,
          schema: kycEvaluationSchema,
        },
      },
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    sendJson(res, response.status, {
      error: body?.error?.message || "OpenAI KYC evaluation failed.",
    });
    return;
  }

  const evaluation = parseOpenAiJson(body, "OpenAI returned an unreadable KYC evaluation.", {
    reviewed_documents: kycDocuments.map((document) => document.name),
    evaluated_at: new Date().toISOString(),
  });

  if (evaluation.error) {
    sendJson(res, evaluation.status, { error: evaluation.error });
    return;
  }

  const saved = await saveKycEvaluation(user.uid, questionnaire, evaluation.data, kycDocuments);
  sendJson(res, 200, {
    ...evaluation.data,
    saved_record: saved,
  });
}

async function handleDealList(req, res) {
  const user = await requireFirebaseUser(req, res);
  if (!user) {
    return;
  }

  const snapshot = await firestore.collection("users").doc(user.uid).collection("deals").orderBy("updated_at", "desc").limit(50).get();
  const deals = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  sendJson(res, 200, { deals });
}

async function handleProfile(req, res) {
  const user = await requireFirebaseUser(req, res);
  if (!user) {
    return;
  }

  const profile = await ensureUserProfile(user);
  sendJson(res, 200, { profile });
}

async function handleDocumentSave(req, res) {
  const user = await requireFirebaseUser(req, res);
  if (!user) {
    return;
  }

  const payload = await readJson(req, maxUploadBytes);
  const documents = sanitizeUploadedDocuments(payload?.documents, 20);

  sendJson(res, 200, {
    saved: 0,
    temporary: true,
    documents: documents.map(({ name, type, size }) => ({ name, type, size })),
  });
}

async function handleKycDocumentSave(req, res) {
  const user = await requireFirebaseUser(req, res);
  if (!user) {
    return;
  }

  const payload = await readJson(req, maxUploadBytes);
  const safeDocuments = sanitizeUploadedDocuments(payload?.documents, 10);

  if (safeDocuments.length < 2) {
    sendJson(res, 400, { error: "Upload both required KYC documents before submitting the questionnaire." });
    return;
  }

  sendJson(res, 200, {
    saved: 0,
    temporary: true,
    documents: safeDocuments.map(({ name, type, size }) => ({ name, type, size })),
  });
}

function sanitizeDeal(deal) {
  if (!deal || typeof deal !== "object") {
    return {
      id: "",
      name: "Untitled Deal",
      documents: [],
      documentChecklist: {},
    };
  }

  return {
    id: clean(deal.id, 120),
    name: clean(deal.name),
    type: clean(deal.type),
    amount: clean(deal.amount),
    currency: clean(deal.currency),
    buyer: clean(deal.buyer),
    seller: clean(deal.seller),
    origin_country: clean(deal.origin_country),
    destination_country: clean(deal.destination_country),
    payment_terms: clean(deal.payment_terms),
    instrument: clean(deal.instrument),
    incoterms: clean(deal.incoterms),
    closing_date: clean(deal.closing_date),
    notes: clean(deal.notes, 4000),
    documents: Array.isArray(deal.documents) ? deal.documents.map((name) => clean(name, 180)).filter(Boolean) : [],
    documentChecklist: deal.documentChecklist && typeof deal.documentChecklist === "object" ? deal.documentChecklist : {},
    revision: Number(deal.revision || 1),
    evaluation_run: Number(deal.evaluation_run || 0),
    report_status: clean(deal.report_status),
  };
}

function sanitizeUploadedDocuments(documents, limit) {
  const safeDocuments = (Array.isArray(documents) ? documents.slice(0, limit) : [])
    .map((document) => ({
      name: clean(document.name, 180).replace(/[/:\\]/g, "-"),
      type: clean(document.type, 120) || "application/octet-stream",
      size: Number(document.size || 0),
      data: clean(document.data, maxUploadBytes),
    }))
    .filter((document) => document.name && document.data);

  const totalBytes = safeDocuments.reduce((sum, document) => sum + document.size, 0);

  if (totalBytes > maxUploadBytes) {
    const error = new Error("Uploaded documents are too large. Keep the total under 24 MB.");
    error.statusCode = 413;
    throw error;
  }

  return safeDocuments;
}

async function saveDealEvaluation(uid, deal, evaluation, documents) {
  const dealId = clean(deal.id, 120).replace(/[^a-zA-Z0-9._-]/g, "") || `deal-${Date.now()}`;
  const evaluatedAt = new Date().toISOString();
  const dealRef = firestore.collection("users").doc(uid).collection("deals").doc(dealId);
  const evaluationRef = dealRef.collection("evaluations").doc();
  const documentMetadata = documents.map(({ name, type, size }) => ({ name, type, size }));
  const dealRecord = {
    ...deal,
    id: dealId,
    documents: documentMetadata.map((document) => document.name),
    document_count: documentMetadata.length,
    score: evaluation.readiness_score ?? null,
    evaluation_run: Number(deal.evaluation_run || 0),
    report_status: Number(evaluation.readiness_score || 0) >= 80 ? "Ready for Admin" : "Needs Revision",
    updated_at: evaluatedAt,
  };

  await dealRef.set(dealRecord, { merge: true });
  await evaluationRef.set({
    deal_id: dealId,
    evaluated_at: evaluatedAt,
    evaluation,
    document_metadata: documentMetadata,
  });

  return {
    deal_id: dealId,
    evaluation_id: evaluationRef.id,
    evaluated_at: evaluatedAt,
  };
}

async function saveKycEvaluation(uid, questionnaire, evaluation, documents) {
  const evaluatedAt = new Date().toISOString();
  const kycRef = firestore.collection("users").doc(uid).collection("kyc_reviews").doc();

  await kycRef.set({
    questionnaire,
    evaluation,
    document_metadata: documents.map(({ name, type, size }) => ({ name, type, size })),
    evaluated_at: evaluatedAt,
  });

  return {
    kyc_review_id: kycRef.id,
    evaluated_at: evaluatedAt,
  };
}

async function ensureUserProfile(user) {
  const userRef = firestore.collection("users").doc(user.uid);
  const counterRef = firestore.collection("system").doc("client_id_counter");

  return firestore.runTransaction(async (transaction) => {
    const existingUser = await transaction.get(userRef);

    if (existingUser.exists && existingUser.data()?.client_id) {
      const data = existingUser.data();
      const updates = {
        email: user.email || data.email || "",
        last_seen_at: new Date().toISOString(),
      };
      transaction.set(userRef, updates, { merge: true });
      return {
        uid: user.uid,
        client_id: data.client_id,
        email: updates.email,
        status: data.status || "active",
        created_at: data.created_at || null,
      };
    }

    const counterDoc = await transaction.get(counterRef);
    const current = Number(counterDoc.exists ? counterDoc.data()?.current : 1000) || 1000;
    const nextClientId = String(current + 1);
    const now = new Date().toISOString();
    const profile = {
      client_id: nextClientId,
      email: user.email || "",
      status: "active",
      created_at: existingUser.exists ? existingUser.data()?.created_at || now : now,
      last_seen_at: now,
    };

    transaction.set(counterRef, { current: current + 1, updated_at: now }, { merge: true });
    transaction.set(userRef, profile, { merge: true });

    return {
      uid: user.uid,
      ...profile,
    };
  });
}

function sanitizeQuestionnaire(questionnaire) {
  if (!questionnaire || typeof questionnaire !== "object") {
    return null;
  }

  const excludedFields = new Set(["signature_image"]);

  return Object.entries(questionnaire).reduce((result, [key, value]) => {
    if (excludedFields.has(key)) {
      return result;
    }

    result[clean(key, 80)] = typeof value === "boolean" ? value : clean(value, 2000);
    return result;
  }, {});
}

function clean(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function readJson(req, maxBytes = 100000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(root, requestedPath));
  const pathSegments = requestedPath.split("/").filter(Boolean);

  if (!filePath.startsWith(root) || pathSegments.some((segment) => segment.startsWith(".")) || pathSegments[0] === "KYC") {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(content);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function serveFirebaseConfig(res) {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${firebaseProjectId}.firebaseapp.com`,
    projectId: firebaseProjectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "",
  };

  res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
  res.end(`const firebaseConfig = ${JSON.stringify(firebaseConfig)};\n\nif (window.firebase && !window.firebase.apps.length) {\n  window.firebase.initializeApp(firebaseConfig);\n}\n\nwindow.nfelFirebase = {\n  auth: window.firebase?.auth ? window.firebase.auth() : null,\n};\n`);
}

function sendParsedOpenAiJson(res, body, fallbackMessage, extraFields = {}) {
  const parsed = parseOpenAiJson(body, fallbackMessage, extraFields);

  if (parsed.error) {
    sendJson(res, parsed.status, { error: parsed.error });
    return;
  }

  sendJson(res, 200, parsed.data);
}

function parseOpenAiJson(body, fallbackMessage, extraFields = {}) {
  const text = getOpenAiOutputText(body);

  if (!text) {
    return {
      status: 502,
      error: body?.status === "incomplete" ? "OpenAI response was incomplete. Try again with fewer documents or a faster model." : fallbackMessage,
    };
  }

  try {
    const parsed = maskClientReferences(JSON.parse(text));
    return {
      status: 200,
      data: {
        ...parsed,
        ...extraFields,
      },
    };
  } catch {
    return {
      status: 502,
      error: fallbackMessage,
    };
  }
}

function maskClientReferences(value) {
  if (Array.isArray(value)) {
    return value.map(maskClientReferences);
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((result, [key, entry]) => {
      result[key] = maskClientReferences(entry);
      return result;
    }, {});
  }

  if (typeof value !== "string") {
    return value;
  }

  return value
    .replace(/\bbeneficiar(?:y|ies)\b(?:\s+(?:name|client|party))?(?:\s*(?:is|:|-)\s*)?[^,.;\n)]*/gi, (match) => {
      const label = match.match(/\bbeneficiar(?:y|ies)\b/i)?.[0] || "beneficiary";
      return `${label}: ABC client`;
    })
    .replace(/\bin favou?r of\b\s*[^,.;\n)]*/gi, (match) => {
      const phrase = match.match(/\bin favou?r of\b/i)?.[0] || "in favour of";
      return `${phrase} ABC client`;
    });
}

function getOpenAiOutputText(body) {
  if (typeof body?.output_text === "string") {
    return body.output_text;
  }

  return (body?.output || [])
    .flatMap((item) => item?.content || [])
    .filter((content) => content?.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("");
}

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      return;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}
