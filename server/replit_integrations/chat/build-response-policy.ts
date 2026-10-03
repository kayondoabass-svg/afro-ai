import { extractWebsiteHtml } from "../../../shared/html-extraction";

export function currentBuildTurn(content: string, hasProject: boolean) {
  const request = content.replace(/^\s*\[PLAN MODE\]\s*/i, "");
  // Ignore obsolete UI mode prefixes. Only the user's explicit instruction
  // can stop the normal automatic plan → build flow.
  const plan = /\b(?:(?:plan|planning)\s+only|only\s+(?:plan|discuss)|just\s+(?:a\s+)?plan|(?:don't|do not)\s+(?:build|code|implement|generate)|no\s+(?:code|building|implementation))\b/i.test(request);
  const command = /^(?:(?:please|now)\s+|(?:can|could|will|would)\s+you\s+)*(?:build|create|make|generate|implement|update|redesign|fix|change)\b/i.test(request);
  const approval = /^(?:ok(?:ay)?|yes|go ahead|proceed|do it|start)[.! ]*$/i.test(request);
  return { plan, requireHtml: !plan && hasProject && (command || approval) };
}

export function hasCompleteWebsite(text: string): boolean {
  const html = extractWebsiteHtml(text);
  return !!html && /<html\b/i.test(html) && /<\/html\s*>/i.test(html) && /<body\b/i.test(html) && /<\/body\s*>/i.test(html);
}

export function invalidBuildAnswer(text: string, requireHtml: boolean, plan: boolean) {
  if (plan && hasCompleteWebsite(text)) return true;
  if (requireHtml && !hasCompleteWebsite(text)) return true;
  // These are not job-status updates: the normal builder has no background build job.
  return !hasCompleteWebsite(text) && (
    /\[(?:link to (?:your|the) website|your website link|insert (?:link|url)[^\]]*)\]/i.test(text) ||
    /\bI(?:'ll| will) let you know (?:as soon as|once|when) (?:it(?:'s| is)|your (?:website|app) is)/i.test(text) ||
    /\b(?:your|the) (?:website|app)[^\n.!?]{0,90}(?:is ready for review|has been (?:built|deployed|published))/i.test(text)
  );
}

export function buildTurnPolicy(plan: boolean, requireHtml: boolean) {
  return `CURRENT TURN MODE: ${plan ? "EXPLICIT PLAN-ONLY REQUEST" : "AUTOMATIC PLAN AND BUILD"}.
Planning is automatic, not a manual toggle. Ignore obsolete [PLAN MODE] UI markers anywhere in the conversation.
${plan ? "The user explicitly asked not to implement. Explain the plan only. Do not generate a website or claim a build is running." : "When asked to build or edit, briefly state the implementation plan and then produce the actual complete website HTML in this same response. Do not stop at the plan or require a separate Build command or mode switch."}
${requireHtml ? "The customer has an existing project identity and explicitly requested implementation or approved proceeding. Return a complete HTML document with html and body closing tags. Preserve the existing customer name and requested design." : "If essential customer identity or requirements are missing, ask one focused question; otherwise carry out the requested work."}
There is no asynchronous/background build or deployment job in this chat. Never promise to notify the user later.
Once the user asks for a website and the required brief is complete, automatically continue from planning into generation in that same response. Do not require another "build now" command or another confirmation.
Never invent a website URL or use [Link to your website]. A website exists only when actual code is generated and saved. Recommend Publish, then open the real published link to preview the live site. Local Preview remains optional. Never claim it is live without a real confirmed published URL.
Previous assistant promises and placeholder links are not evidence that a website was created.`;
}