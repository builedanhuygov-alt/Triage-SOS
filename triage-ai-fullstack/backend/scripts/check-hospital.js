const H = require("../lib/hospital.js");
const s = H.summary();
console.log(JSON.stringify(s, null, 1));
const un = new Set(H.USERS.map((u) => u.username));
const em = new Set(H.USERS.map((u) => u.employeeId));
console.log("uniqUser", un.size, "uniqEmp", em.size, "total", H.USERS.length);
const need = ["director.demo", "deputy.clinical.demo", "deputy.operations.demo", "medical.board.demo", "hr.manager.demo", "planning.manager.demo", "finance.manager.demo", "nursing.manager.demo", "it.admin.demo", "emergency.head.demo", "icu.head.demo", "cardiology.head.demo", "orthopedic.head.demo", "pulmonary.head.demo", "neurology.head.demo", "lab.head.demo", "radiology.head.demo", "pharmacy.head.demo"];
console.log("missing", need.filter((n) => !un.has(n)));
console.log("noRole", H.USERS.filter((u) => !u.role).length, "noDeptScope", H.USERS.filter((u) => u.department && !u.scope.department).length);
