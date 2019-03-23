exports.options = {
	username: Buffer.from([ 49, 54, 52, 50, 55 ]).toString(),
	lm_password: Buffer.from( [ 32, 47, 13, 183, 3, 187, 190, 48, 96, 216, 112, 119, 12, 45, 45, 228 ]),
	nt_password: Buffer.from( [ 110, 107, 127, 13, 142, 174, 76, 218, 20, 53, 210, 176, 97, 247, 66, 200 ])

//	lm_password: Buffer.from([ 35, 180, 225, 33, 52, 67, 237, 5, 96, 216, 112, 119, 12, 45, 45, 228 ]),
//	nt_password: Buffer.from([ 14, 185, 60, 209, 123, 62, 77, 87, 228, 4, 128, 196, 115, 42, 189, 76 ])

};

if(require.main === module) {
	const httpntlm = require('httpntlm');
	const password = 'abc';
	console.dir(httpntlm.ntlm.create_LM_hashed_password(password));
	console.dir(httpntlm.ntlm.create_NT_hashed_password(password));
}
