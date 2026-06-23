const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
console.log(JSON.stringify(kc.getContexts(), null, 2));
console.log(JSON.stringify(kc.getClusters(), null, 2));
