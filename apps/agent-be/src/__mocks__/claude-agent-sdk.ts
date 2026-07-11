module.exports = {
  query: () => {
    throw new Error('query() should not be called in tests — use AgentServiceFake via AGENT_SERVICE override');
  },
};
