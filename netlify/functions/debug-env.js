// TEMPORARY DIAGNOSTIC — delete this file once the env var issue is confirmed fixed.
// Never returns the full key — only length/prefix/whitespace info for comparison.
exports.handler = async () => {
  const key = process.env.BREVO_API_KEY || "";
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      present: key.length > 0,
      length: key.length,
      startsWith: key.slice(0, 8),
      endsWith: key.slice(-4),
      hasLeadingWhitespace: /^\s/.test(key),
      hasTrailingWhitespace: /\s$/.test(key),
      hasInternalWhitespace: /\s/.test(key.trim()),
    }),
  };
};
