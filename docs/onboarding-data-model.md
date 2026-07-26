# Client Onboarding, Signatures, and Deal Submission Model

This portal should treat onboarding as a one-time client requirement. Deal submissions are separate records that can be created many times after onboarding is complete.

## Account Data

Collected during account creation:
- `client_id`
- email
- phone
- full name
- company name
- role/title
- auth provider UID
- account status: `pending_onboarding`, `active`, `suspended`
- timestamps: created, last login, updated

## One-Time Onboarding Questionnaire

Collection: `client_onboarding`

One record per client:
- client identity: legal name, DOB, citizenship, tax/federal ID, passport details
- contact details: home address, email, phone
- business profile: business name, address, registered office, registration/tax number, nature of business, legal representative
- bank profile: bank, branch, SWIFT, account name, account number, IBAN, bank officer contact
- financial profile: annual income, available funds, attached financial statement/balance sheet metadata
- asset affidavit: asset description, USD value, location, account/safekeeping details, source/origin/history of assets
- goals: top goals, priorities, time horizons
- risk assessment answers and calculated risk score/profile
- acknowledgments: privacy policy, authorization to release information, truth certification
- status: `draft`, `submitted`, `approved`, `needs_review`
- immutable submitted snapshot JSON
- timestamps: started, submitted, reviewed, updated

## Signature and Confirmation Records

Collection: `client_confirmations`

Create a separate record for every signed action:
- `confirmation_id`
- `client_id`
- `related_record_type`: `onboarding`, `deal_submission`, `report_download`, etc.
- `related_record_id`
- signature type: drawn signature, checkbox consent, future e-sign provider envelope
- drawn signature image path or encoded signature artifact
- signed date/time
- consent text version
- IP address
- user agent
- auth UID
- hash of signed payload
- final document/PDF URL if generated

This provides an audit trail without overwriting old confirmations.

## Deal Submissions

Collection: `deal_submissions`

Many records per client:
- `deal_id`
- `client_id`
- deal name
- deal type
- transaction amount
- use of funds
- counterparties
- trade corridor/countries
- currency exposure
- repayment support
- notes
- status: `draft`, `submitted_for_review`, `evaluation_ready`, `evaluated`, `needs_documents`
- created/submitted timestamps

Deal submission creation should be blocked unless `client_onboarding.status` is `submitted` or `approved`.

## Documents / Assets

Collection: `client_assets`

Records for uploaded files:
- `asset_id`
- `client_id`
- optional `deal_id`
- file name
- storage path
- MIME type
- file size
- category: passport, proof of funds, balance sheet, transaction summary, receivables schedule, contract, other
- uploaded timestamp
- checksum/hash

## AI Evaluation

Collection: `deal_evaluations`

Many evaluations per deal:
- `evaluation_id`
- `deal_id`
- `client_id`
- run number
- model/training version
- source asset IDs
- readiness score
- score delta from prior run
- findings
- risks
- recommendations
- report PDF storage path
- created timestamp

## Enforcement Rules

- Client cannot submit a deal until onboarding is submitted.
- Client can save onboarding as draft, but draft does not unlock deal submission.
- Client can update deal documents and rerun evaluation.
- Every evaluation keeps its own history record.
- Every signature/acknowledgment creates a separate immutable confirmation record.
