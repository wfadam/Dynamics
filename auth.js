exports.options = {
	username: Buffer.from([ 49, 54, 52, 50, 55 ]).toString(),
	lm_password: Buffer.from( [ 249, 228, 175, 198, 91, 141, 168, 223, 188, 17, 247, 156, 115, 214, 39, 166 ]),
	nt_password: Buffer.from( [ 236, 51, 85, 233, 147, 29, 8, 118, 189, 223, 228, 92, 183, 26, 109, 78 ])
};

if(require.main === module) {
	const httpntlm = require('httpntlm');
	const password = 'abc';
	console.dir(httpntlm.ntlm.create_LM_hashed_password(password));
	console.dir(httpntlm.ntlm.create_NT_hashed_password(password));
}
