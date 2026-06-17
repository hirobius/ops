/**
 * test-mode-guard
 *
 * Every workflow that intends to send something outbound (email, SMS, EZLynx
 * write, DocuSign send) MUST call guardOutbound() before the call. In test
 * mode the guard rewrites the recipient to testRecipient and marks the action
 * dryRun=true; the workflow then logs the intended payload instead of sending.
 *
 * In production mode the guard is a pass-through that asserts a recipient
 * was explicitly supplied (no defaults, no surprises).
 */

export function guardOutbound({ rootConfig, workflow, channel, recipient, payload }) {
  if (!rootConfig) throw new Error('guardOutbound: rootConfig is required');
  if (!workflow) throw new Error('guardOutbound: workflow is required');
  if (!channel) throw new Error('guardOutbound: channel is required (email|sms|ezlynx|docusign|other)');

  if (rootConfig.mode === 'test') {
    return {
      dryRun: true,
      mode: 'test',
      workflow,
      channel,
      intendedRecipient: rootConfig.testRecipient,
      originalRecipient: recipient ?? null,
      payload,
    };
  }

  if (rootConfig.mode === 'production') {
    if (!recipient) {
      throw new Error(
        `[${workflow}] production mode but no recipient provided to guardOutbound — refusing to send`,
      );
    }
    const allowed = rootConfig.productionRecipients ?? [];
    if (allowed.length > 0 && !allowed.includes(recipient)) {
      throw new Error(
        `[${workflow}] production recipient ${recipient} not in productionRecipients allowlist`,
      );
    }
    return {
      dryRun: false,
      mode: 'production',
      workflow,
      channel,
      intendedRecipient: recipient,
      originalRecipient: recipient,
      payload,
    };
  }

  throw new Error(`guardOutbound: unknown mode ${rootConfig.mode}`);
}
