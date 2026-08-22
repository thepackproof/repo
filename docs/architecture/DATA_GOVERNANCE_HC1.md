# HC-1 data governance

Imported receipts may contain name, address, email, and payment metadata.

HC-1 intake keeps the correspondence digest, parser version, and populated item fields. Raw correspondence is not retained. Email, phone, and payment-shaped strings are redacted from retained item text (`functions/src/domain/v1/privacy-intake.ts`). Do not expand raw-artifact retention without a written evidentiary purpose.

Account export and delete remain the consumer path. Legal hold is not implemented.

Flags and parser versions are not evidence facts. Historical evidence records the policy and versions used at capture.
