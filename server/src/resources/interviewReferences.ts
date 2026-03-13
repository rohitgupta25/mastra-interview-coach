export type ReferenceSourceType = "pdf" | "web" | "md";

export type ReferenceDoc = {
  id: string;
  sourceType: ReferenceSourceType;
  title: string;
  sourceLabel: string;
  url?: string;
  tags: string[];
  content: string;
};

export const INTERVIEW_REFERENCE_DOCS: ReferenceDoc[] = [
  {
    id: "pdf-overview-levels",
    sourceType: "pdf",
    title: "Frontend interview resource map by level",
    sourceLabel: "frontend_interview_resources.pdf",
    tags: ["frontend", "interview", "levels", "junior", "mid", "senior", "architect"],
    content:
      "The resource guide organizes preparation into Junior, Mid, Senior, and Architect tracks across JavaScript, React, Preact, and frontend system design.",
  },
  {
    id: "pdf-js-path",
    sourceType: "pdf",
    title: "JavaScript progression resources",
    sourceLabel: "frontend_interview_resources.pdf",
    tags: ["javascript", "fundamentals", "engine", "performance", "architect"],
    content:
      "JavaScript preparation grows from MDN and JavaScript.info fundamentals to advanced engine and performance resources such as v8.dev and web.dev.",
  },
  {
    id: "pdf-react-path",
    sourceType: "pdf",
    title: "React progression resources",
    sourceLabel: "frontend_interview_resources.pdf",
    tags: ["react", "patterns", "testing", "fiber", "nextjs", "storybook"],
    content:
      "React progression starts with core React docs, then moves into patterns, testing, and performance profiling. Architect-level preparation includes Next.js, Storybook, and large-scale frontend patterns.",
  },
  {
    id: "pdf-preact-path",
    sourceType: "pdf",
    title: "Preact and performance focus",
    sourceLabel: "frontend_interview_resources.pdf",
    tags: ["preact", "signals", "bundle-size", "react-differences"],
    content:
      "Preact preparation should cover React differences, Preact Signals, and bundle size trade-offs for performance-sensitive storefronts.",
  },
  {
    id: "pdf-system-design-path",
    sourceType: "pdf",
    title: "Frontend system design preparation",
    sourceLabel: "frontend_interview_resources.pdf",
    tags: ["system-design", "frontend-architecture", "micro-frontends", "observability", "diagramming"],
    content:
      "Frontend system design practice should include large-scale architecture, micro-frontends, observability and RUM, performance budgets, and communicating trade-offs with clear diagrams.",
  },
  {
    id: "pdf-prep-sequence",
    sourceType: "pdf",
    title: "Suggested architect preparation sequence",
    sourceLabel: "frontend_interview_resources.pdf",
    tags: ["preparation", "roadmap", "fundamentals", "architecture", "cicd", "monorepo"],
    content:
      "Suggested sequence: core browser and JS fundamentals, component architecture and design systems, large-scale app patterns, performance at scale, system-design practice, and CI/CD plus monorepo strategy.",
  },
  {
    id: "web-react-interviewbit-core",
    sourceType: "web",
    title: "React interview fundamentals and advanced topics",
    sourceLabel: "InterviewBit",
    url: "https://www.interviewbit.com/react-interview-questions/",
    tags: ["react", "interview", "fundamentals", "hooks", "state-management", "performance"],
    content:
      "React preparation should emphasize fundamentals (components, props/state, lifecycle/hooks, JSX, reconciliation) and applied topics like context, memoization, rendering behavior, and performance trade-offs.",
  },
  {
    id: "web-react-greatfrontend-core",
    sourceType: "web",
    title: "React interview question coverage from ex-interviewers",
    sourceLabel: "GreatFrontend",
    url: "https://www.greatfrontend.com/blog/100-react-interview-questions-straight-from-ex-interviewers",
    tags: ["react", "interview", "core-concepts", "hooks", "component-design", "ui-coding"],
    content:
      "React interview loops often combine conceptual questions and coding tasks around component design, hooks, state ownership, forms, async data, and render optimization.",
  },
  {
    id: "web-react-gfg-core",
    sourceType: "web",
    title: "React interview questions and answers",
    sourceLabel: "GeeksforGeeks",
    url: "https://www.geeksforgeeks.org/reactjs/react-interview-questions/",
    tags: ["react", "jsx", "props", "state", "hooks", "reconciliation", "interview"],
    content:
      "Core React topics include JSX transformation, props vs state, controlled components, hooks (useState/useEffect/useContext/useReducer), reconciliation, and avoiding unnecessary re-renders.",
  },
  {
    id: "web-react-braintrust-core",
    sourceType: "web",
    title: "React developer interview focus areas",
    sourceLabel: "Braintrust",
    url: "https://www.usebraintrust.com/hire/interview-questions/react-js-developers",
    tags: ["react", "interview", "frontend", "seniority", "architecture", "performance"],
    content:
      "React interviews should be calibrated by seniority while covering fundamentals, practical debugging, component architecture, data flow clarity, and performance-informed decisions.",
  },
  {
    id: "web-react-prepinsta-core",
    sourceType: "web",
    title: "React JS technical interview preparation list",
    sourceLabel: "PrepInsta",
    url: "https://prepinsta.com/interview-preparation/technical-interview-questions/react-js/",
    tags: ["react", "interview", "technical", "beginner", "intermediate", "advanced"],
    content:
      "React preparation should include basic-to-advanced progression with strong command of hooks, forms, component patterns, and practical use-case discussions.",
  },
  {
    id: "web-js-sudheer-core",
    sourceType: "web",
    title: "Comprehensive JavaScript interview question bank",
    sourceLabel: "GitHub",
    url: "https://github.com/sudheerj/javascript-interview-questions",
    tags: ["javascript", "interview", "core-javascript", "closures", "promises", "event-loop", "this"],
    content:
      "Core JavaScript interviews should rotate through closures, lexical scope, hoisting/TDZ, this binding, prototypes, promises/async-await, event loop, equality semantics, modules, and functional patterns.",
  },
  {
    id: "web-js-interviewbit-core",
    sourceType: "web",
    title: "JavaScript interview fundamentals and practical scenarios",
    sourceLabel: "InterviewBit",
    url: "https://www.interviewbit.com/javascript-interview-questions/",
    tags: ["javascript", "fundamentals", "es6", "async", "interview"],
    content:
      "JavaScript interviews usually combine language fundamentals with practical coding and debugging: scope, closures, prototypes, async behavior, and modern ES features.",
  },
  {
    id: "web-js-gfg-core",
    sourceType: "web",
    title: "Basic JavaScript interview questions and answers",
    sourceLabel: "GeeksforGeeks",
    url: "https://www.geeksforgeeks.org/javascript/javascript-interview-questions/",
    tags: ["javascript", "var-let-const", "hoisting", "promises", "call-apply-bind", "closures", "interview"],
    content:
      "Core JavaScript preparation should cover var/let/const, hoisting, lexical scope, call/apply/bind, promises, event-loop behavior, strict mode, and practical examples for each concept.",
  },
  {
    id: "web-storefront-get-started-hub",
    sourceType: "web",
    title: "Adobe Commerce Storefront get-started hub",
    sourceLabel: "Adobe Experience League",
    url: "https://experienceleague.adobe.com/developer/commerce/storefront/get-started/",
    tags: ["adobe-commerce", "storefront", "get-started", "navigation", "implementation"],
    content:
      "The get-started hub outlines end-to-end onboarding for Commerce storefront development, linking setup, storefront creation, drop-ins, and deployment-oriented next steps.",
  },
  {
    id: "web-create-storefront-big-picture",
    sourceType: "web",
    title: "Create a storefront - big picture",
    sourceLabel: "Adobe Experience League",
    url: "https://experienceleague.adobe.com/developer/commerce/storefront/get-started/create-storefront/",
    tags: ["adobe-commerce", "eds", "storefront", "boilerplate", "setup"],
    content:
      "Storefront creation flow includes generating a repo from the Commerce boilerplate template, linking repo and commerce data, initializing content, and configuring local development.",
  },
  {
    id: "web-create-storefront-steps",
    sourceType: "web",
    title: "Create a storefront - setup workflow",
    sourceLabel: "Adobe Experience League",
    url: "https://experienceleague.adobe.com/developer/commerce/storefront/get-started/create-storefront/",
    tags: ["sidekick", "code-sync", "helix", "da-live", "local-dev"],
    content:
      "Key workflow steps: create site repo, install code sync app, link repo to data via config, initialize content in da.live, install Sidekick, and run local development.",
  },
  {
    id: "web-boilerplate-terminology",
    sourceType: "web",
    title: "Boilerplate terminology for drop-ins and blocks",
    sourceLabel: "Adobe Experience League",
    url: "https://experienceleague.adobe.com/developer/commerce/storefront/boilerplate/getting-started/",
    tags: ["drop-ins", "commerce-blocks", "content-blocks", "terminology", "architecture"],
    content:
      "Drop-in components are full-featured commerce experiences. Commerce blocks integrate drop-ins in Edge Delivery Services. Content blocks support non-commerce page layout and content.",
  },
  {
    id: "web-dropins-quick-start",
    sourceType: "web",
    title: "Drop-ins quick-start implementation pattern",
    sourceLabel: "Adobe Experience League",
    url: "https://experienceleague.adobe.com/developer/commerce/storefront/dropins/all/quick-start/",
    tags: ["drop-ins", "quick-start", "initializer", "render", "containers", "integration"],
    content:
      "Drop-ins are integrated through initializer scripts and rendered containers. Questions should test setup correctness, import structure, and extension/customization boundaries.",
  },
  {
    id: "web-licensing-requirements",
    sourceType: "web",
    title: "Drop-ins licensing requirements",
    sourceLabel: "Adobe Experience League",
    url: "https://experienceleague.adobe.com/developer/commerce/storefront/licensing/",
    tags: ["licensing", "drop-ins", "acss", "aco", "versioning"],
    content:
      "Adobe Commerce drop-ins require eligible licensing. Interview answers should reflect awareness of eligibility and release/version governance when discussing production adoption.",
  },
  {
    id: "web-multistore",
    sourceType: "web",
    title: "Multistore setup patterns",
    sourceLabel: "Adobe Experience League",
    url: "https://experienceleague.adobe.com/developer/commerce/storefront/setup/configuration/multistore-setup/",
    tags: ["multistore", "localization", "domains", "subfolders", "configuration"],
    content:
      "Multistore can be implemented via multiple domains or subfolder root paths, sharing code while isolating locale, region, brand configuration, and data boundaries.",
  },
  {
    id: "web-optimizer-next-steps",
    sourceType: "web",
    title: "Storefront setup next steps",
    sourceLabel: "Adobe Experience League",
    url: "https://experienceleague.adobe.com/en/docs/commerce/optimizer/storefront",
    tags: ["optimizer", "sidekick", "customization", "configuration-service", "migration"],
    content:
      "After initial setup, teams should standardize preview/publish workflow, local customization process, and migration toward advanced configuration service capabilities.",
  },
];
