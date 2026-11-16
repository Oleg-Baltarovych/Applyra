# 010. Document upload and parsing sandbox

- Status: Accepted
- Date: 2026-11-16

## Context
- R1: users upload CV files (PDF/DOCX ≤ 5 MB) to a private S3-compatible bucket; text is extracted (`pdfjs`/`unpdf`, `mammoth`) into `parsedText` (see `docs/spec/03-functional.md`, `docs/spec/09-security-privacy.md`).
- Review S-08: parsing untrusted files risks zip bombs (DOCX is a zip), XXE, and pdf.js CVEs; an unconstrained presigned PUT is only validated after the upload.
- Cloudflare R2 (ADR 011) does not support presigned POST policies (`content-length-range`).
- Existing rules: MIME **and** magic-byte check (`file-type`), signed URLs ≤ 5 min, storage key = UUID, objects removed on account deletion.

## Decision
Uploads go through a **presigned PUT with signed `Content-Length` and `Content-Type`** into a **quarantine** prefix; parsing runs in a **resource-limited child process**.
- The API signs the declared size (≤ 5 MB) and MIME type into the URL (TTL 5 min); a request with a different length or type fails signature validation at storage; key = UUID; private bucket.
- Status lives on `DocumentVersion.status` (`PENDING` → `READY` / `REJECTED`); `complete` call does a `HEAD` check before validation.
- Object stays in quarantine until validated (size, MIME + magic bytes); only then promoted and visible to the user; invalid objects deleted.
- `DocumentUploaded` event (ADR 006) triggers parsing in the worker.
- Parser runs in a child process with memory, CPU-time and output-size limits; killed on timeout.
- pdf.js with `isEvalSupported: false`; DOCX decompression bounded (total uncompressed size and entry count); no external entity resolution.
- Downloads only through short-lived signed URLs after the owner check; no public URLs.
- Parse failure keeps the document (status failed), never crashes the worker.
- Uploads disabled for demo users (ADR 014).

## Alternatives considered
- Presigned POST with `content-length-range` — preferred on S3/MinIO, but not supported by Cloudflare R2.
- Unconstrained presigned PUT — no size/type binding before upload (S-08).
- Parsing in the worker process — a malicious file can exhaust memory or exploit the parser inside a process holding DB/Redis credentials.
- Upload through the API (multipart) — API handles file bytes; more memory pressure; loses direct-to-storage benefits.
- External parsing service — cost and sends CVs (PII) to a third party.

## Consequences
- Positive: untrusted bytes never processed in a privileged process; size enforced by storage.
- Negative / trade-offs: extra quarantine state and cleanup; child-process overhead per document.
- Follow-ups: ClamAV malware scan (R1 Could); concrete memory/time limits; negative upload fixtures (zip bomb, XXE, polyglot) in tests (review T-03).
