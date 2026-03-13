"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ragRetrieverTool = void 0;
exports.retrieveReferenceHits = retrieveReferenceHits;
exports.setReferenceDocs = setReferenceDocs;
exports.getReferenceDocs = getReferenceDocs;
const interviewReferences_1 = require("../resources/interviewReferences");
function withoutPdfDocs(docs) {
    return docs.filter((doc) => doc.sourceType !== "pdf");
}
let activeReferenceDocs = withoutPdfDocs([...interviewReferences_1.INTERVIEW_REFERENCE_DOCS]);
function tokenize(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3);
}
function unique(items) {
    return [...new Set(items)];
}
function scoreDocument(doc, queryTokens) {
    if (queryTokens.length === 0)
        return 0;
    const haystack = `${doc.title} ${doc.content}`.toLowerCase();
    const normalizedTags = doc.tags.map((tag) => tag.toLowerCase());
    let score = 0;
    for (const token of queryTokens) {
        if (normalizedTags.some((tag) => tag.includes(token))) {
            score += 4;
            continue;
        }
        if (haystack.includes(token)) {
            score += 2;
        }
    }
    return score;
}
function clip(value, max = 190) {
    if (value.length <= max)
        return value;
    return `${value.slice(0, max - 1).trimEnd()}…`;
}
function retrieveReferenceHits(input) {
    const topK = Math.max(1, Math.min(8, Number(input.topK ?? 3)));
    const queryTokens = unique(tokenize(input.query ?? ""));
    if (queryTokens.length === 0) {
        return [];
    }
    return withoutPdfDocs(activeReferenceDocs).map((doc) => ({
        id: doc.id,
        title: doc.title,
        sourceType: doc.sourceType,
        sourceLabel: doc.sourceLabel,
        url: doc.url,
        excerpt: clip(doc.content),
        score: scoreDocument(doc, queryTokens),
    }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}
function setReferenceDocs(nextDocs) {
    if (!Array.isArray(nextDocs) || nextDocs.length === 0) {
        activeReferenceDocs = withoutPdfDocs([...interviewReferences_1.INTERVIEW_REFERENCE_DOCS]);
        return;
    }
    const deduped = new Map();
    for (const doc of nextDocs) {
        if (!doc?.id)
            continue;
        if (doc.sourceType === "pdf")
            continue;
        deduped.set(doc.id, doc);
    }
    activeReferenceDocs = withoutPdfDocs([...deduped.values()]);
}
function getReferenceDocs() {
    return withoutPdfDocs([...activeReferenceDocs]);
}
exports.ragRetrieverTool = {
    id: "ragRetriever",
    name: "ragRetriever",
    description: "Retrieve relevant snippets from local interview reference resources.",
    run: async ({ input }) => {
        return { hits: retrieveReferenceHits(input ?? {}) };
    },
};
