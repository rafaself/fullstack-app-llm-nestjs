# @cat-supplies-store/refunds

Durable, approval-based refund execution for Agent Worker. `RefundExecutionModule` registers the workflow and refund tool with an injected issuer. The worker issuer calls the authenticated Business API, which owns payment persistence and checks ownership, eligibility, and idempotency inside a database transaction; refunds are simulated.

The Business API imports `@cat-supplies-store/refunds/contract` to share the workflow name, version, timeout, and input type without importing worker execution providers. It starts the workflow and handles support approval decisions.

The LLM requests a tool call; approval and deterministic backend checks control whether the refund is applied.
