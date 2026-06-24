const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

module.exports = {
  workflow: {
    activate: [
      async function (dbWorkflow) {
        const path = require('path');

        const exportDir = 'n8n/workflows';

        const safeName = dbWorkflow.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filePath = path.join(exportDir, `${safeName}.json`);

        await execAsync(`n8n export:workflow --id=${dbWorkflow.id} --pretty --output=${filePath}`);

        console.log(`[n8n hook] workflow exported to ${filePath}`);
      }
    ]
  },
};
