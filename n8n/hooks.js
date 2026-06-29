const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');

const execAsync = promisify(exec);
const exportDir = 'n8n/workflows';


module.exports = {
  workflow: {
    activate: [
      async function (dbWorkflow) {
        const safeName = dbWorkflow.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filePath = path.join(exportDir, `${safeName}.json`);

        await execAsync(`n8n export:workflow --id=${dbWorkflow.id} --pretty --output=${filePath}`);

        console.log(`[n8n hook] workflow exported to ${filePath}`);
      }
    ],
    delete: [
      async function (dbWorkflowId) {
        const files = (await fs.readdir(exportDir)).filter(f => f.endsWith('.json'));

        for (const file of files) {
          const filePath = path.join(exportDir, file);
          const content = JSON.parse(await fs.readFile(filePath, 'utf8'));

          if (content.id === dbWorkflowId) {
            await fs.unlink(filePath);
            console.log(`[n8n hook] deleted workflow file ${filePath}`);
            break;
          }
        }
      }
    ]
  },
};
