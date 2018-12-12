exports.options = {
	username: Buffer.from([ 49, 54, 52, 50, 55 ]).toString(),
	lm_password: Buffer.from( [ 32, 47, 13, 183, 3, 187, 190, 48, 96, 216, 112, 119, 12, 45, 45, 228 ]),
	nt_password: Buffer.from( [ 110, 107, 127, 13, 142, 174, 76, 218, 20, 53, 210, 176, 97, 247, 66, 200 ])
};

if(require.main === module) {
	const httpntlm = require('httpntlm');
	const password = 'abc';
	console.dir(httpntlm.ntlm.create_LM_hashed_password(password));
	console.dir(httpntlm.ntlm.create_NT_hashed_password(password));
}
