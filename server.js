const http = require("http");
const fs = require("fs");
const path = require("path");

loadLocalEnv();

const port = Number(process.env.PORT || 4000);
const root = __dirname;
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-5";
const uploadRoot = path.join(root, ".deal-uploads");
const maxUploadBytes = 24 * 1024 * 1024;

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
  },
  required: ["readiness_score", "summary", "key_findings", "risk_flags", "recommended_next_steps"],
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

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error" });
  }
});

server.listen(port, () => {
  console.log(`N.F.EL portal running at http://localhost:${port}`);
});

async function handleEvaluation(req, res) {
  if (!apiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is not configured on the server." });
    return;
  }

  const payload = await readJson(req);
  const deal = sanitizeDeal(payload?.deal);

  deal.name = deal.name || "Untitled Deal";

  const dealDocuments = loadDealDocuments(deal.id);
  const content = [
    {
      type: "input_text",
      text: `Evaluate this submitted deal using all field selections, checklist selections, filenames, and attached document contents. Return only the requested JSON.\n\n${JSON.stringify(deal, null, 2)}`,
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
            "You evaluate trade finance deal readiness for an advisory portal. Be practical, concise, and avoid legal, tax, or final credit approval language.",
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

  try {
    sendJson(res, 200, JSON.parse(body.output_text));
  } catch {
    sendJson(res, 502, { error: "OpenAI returned an unreadable evaluation." });
  }
}

async function handleKycEvaluation(req, res) {
  if (!apiKey) {
    sendJson(res, 500, { error: "OPENAI_API_KEY is not configured on the server." });
    return;
  }

  const payload = await readJson(req, 250000);
  const questionnaire = sanitizeQuestionnaire(payload?.questionnaire);
  const kycDocuments = loadKycDocuments();

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
      file_data: `data:application/pdf;base64,${document.data}`,
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
            "You review KYC onboarding packages for an advisory portal. Be precise, practical, and flag missing or unclear items. You do not certify authenticity, legal compliance, bank validity, or transaction approval.",
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

  try {
    sendJson(res, 200, {
      ...JSON.parse(body.output_text),
      reviewed_documents: kycDocuments.map((document) => document.name),
      evaluated_at: new Date().toISOString(),
    });
  } catch {
    sendJson(res, 502, { error: "OpenAI returned an unreadable KYC evaluation." });
  }
}

async function handleDocumentSave(req, res) {
  const payload = await readJson(req, maxUploadBytes);
  const dealId = clean(payload?.dealId, 120).replace(/[^a-zA-Z0-9._-]/g, "");
  const documents = Array.isArray(payload?.documents) ? payload.documents.slice(0, 20) : [];

  if (!dealId) {
    sendJson(res, 400, { error: "A saved deal ID is required before uploading documents." });
    return;
  }

  const safeDocuments = documents
    .map((document) => ({
      name: clean(document.name, 180),
      type: clean(document.type, 120) || "application/octet-stream",
      size: Number(document.size || 0),
      data: clean(document.data, maxUploadBytes),
    }))
    .filter((document) => document.name && document.data);

  const totalBytes = safeDocuments.reduce((sum, document) => sum + document.size, 0);

  if (totalBytes > maxUploadBytes) {
    sendJson(res, 413, { error: "Uploaded documents are too large for this local prototype. Keep the total under 24 MB." });
    return;
  }

  const dealPath = path.join(uploadRoot, dealId);
  fs.mkdirSync(dealPath, { recursive: true });
  fs.writeFileSync(path.join(dealPath, "documents.json"), JSON.stringify(safeDocuments, null, 2));

  sendJson(res, 200, {
    saved: safeDocuments.length,
    documents: safeDocuments.map(({ name, type, size }) => ({ name, type, size })),
  });
}

async function handleKycDocumentSave(req, res) {
  const payload = await readJson(req, maxUploadBytes);
  const documents = Array.isArray(payload?.documents) ? payload.documents.slice(0, 10) : [];
  const safeDocuments = documents
    .map((document) => ({
      name: clean(document.name, 180).replace(/[/:\\]/g, "-"),
      type: clean(document.type, 120) || "application/octet-stream",
      size: Number(document.size || 0),
      data: clean(document.data, maxUploadBytes),
    }))
    .filter((document) => document.name && document.data);

  const totalBytes = safeDocuments.reduce((sum, document) => sum + document.size, 0);

  if (safeDocuments.length < 2) {
    sendJson(res, 400, { error: "Upload both required KYC documents before submitting the questionnaire." });
    return;
  }

  if (totalBytes > maxUploadBytes) {
    sendJson(res, 413, { error: "KYC documents are too large for this local prototype. Keep the total under 24 MB." });
    return;
  }

  const kycPath = path.join(root, "KYC");
  fs.mkdirSync(kycPath, { recursive: true });

  safeDocuments.forEach((document) => {
    fs.writeFileSync(path.join(kycPath, document.name), Buffer.from(document.data, "base64"));
  });

  sendJson(res, 200, {
    saved: safeDocuments.length,
    documents: safeDocuments.map(({ name, type, size }) => ({ name, type, size })),
  });
}

function sanitizeDeal(deal) {
  if (!deal || typeof deal !== "object") {
    return null;
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
  };
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

function loadDealDocuments(dealId) {
  if (!dealId) {
    return [];
  }

  const safeDealId = clean(dealId, 120).replace(/[^a-zA-Z0-9._-]/g, "");
  const documentsPath = path.join(uploadRoot, safeDealId, "documents.json");

  if (!fs.existsSync(documentsPath)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(documentsPath, "utf8")).slice(0, 20);
  } catch {
    return [];
  }
}

function loadKycDocuments() {
  const kycPath = path.join(root, "KYC");

  if (!fs.existsSync(kycPath)) {
    return [];
  }

  return fs
    .readdirSync(kycPath)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .slice(0, 10)
    .map((name) => {
      const filePath = path.join(kycPath, name);
      return {
        name,
        data: fs.readFileSync(filePath).toString("base64"),
      };
    });
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
