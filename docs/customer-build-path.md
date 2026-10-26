# Customer build path

Use existing account experience, owner-scoped conversation history, project metadata,
file storage and publish/export tools. No new paid hosting service is needed.

1. **Experience first:** use the saved level, otherwise ask whether the customer is
   new, has tried before, or knows how to code. Tailor reasoning to that answer.
2. **Purpose:** use the supplied request/project description. For a bare “build an
   app”, establish its purpose, audience and essential features.
3. **Identity:** use the customer’s explicit app/business name; ask if missing.
   Platform/vendor identity is never the customer’s brand.
4. **Design:** collect missing color/style preferences. Explicit delegation is valid.
   Do not force a platform palette, typography, glass panels or tilt effects.
5. **Explain and build:** briefly describe the chosen direction and requested features,
   then build. Existing edits retain unrelated design and do not restart intake.
6. **Preview and revise:** the existing preview and conversation remain the review
   surface. Generated code and simulated integrations are not proof of live services.
7. **Deliver:** static websites use the existing publish dialog and customer-selected
   app name. Full-stack source uses reviewed GitHub export for customer-managed hosting.
   Neither a repository push nor a ready database proves a live backend deployment.

Intake answers persist as normal conversation messages. A bounded summary is supplied
to subsequent model requests so early answers are not lost from recent-message windows.
Only the current owner's authorized conversation/project is used.

The deterministic intake recognizes common English build requests; system instructions
cover additional phrasing. Naming questions have existing localized text; the newer
experience, purpose and design questions currently use English. This is not yet a fully
localized questionnaire. Prompt instructions alone cannot guarantee visual quality;
real generated outputs still need visual and interaction evaluation.

Existing published apps are not silently renamed or redesigned. Changes to generation
policy affect future requests; publishing improvements take effect after deployment
and an explicit republish.