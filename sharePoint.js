const path = require('path');
const cheerio = require('cheerio');
const auth = require('./auth.js');
const httpntlm = require('httpntlm');
const htmlparser = require("htmlparser2");

const getDocPageUrl = (otype, uid) => `http://dynamics.sandisk.com/Dynamics/tools/documentmanagement/areas.aspx?oId=%7b${uid}%7d&oType=${otype}`;
const encodeParentheses = url => url.replace(/\(/g, '%28').replace(/\)/g, '%29');

function querySharepointLocationID(url) {
	return new Promise((resolve, reject) => {
		const options = Object.assign({ url }, auth.options);
		httpntlm.get(options, (err, res) => {
			if(err) return reject(err);
			if(res && res.body) {
				let found = res.body.match('<sharepointdocumentlocationid>({[0-9A-Z-]+})');
				if(found) resolve(found[1]);
				else reject(`Cannot find sharepointdocumentlocationid from ${url}`);
			}
		});
	});
}

function querySharepointLocation(did) {
	const genPayload = did => `<?xml version="1.0" encoding="utf-8" ?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><RetrieveAbsoluteAndSiteCollectionUrl xmlns="http://schemas.microsoft.com/crm/2009/WebServices"><logicalName>sharepointdocumentlocation</logicalName><entityId>${did}</entityId></RetrieveAbsoluteAndSiteCollectionUrl></soap:Body></soap:Envelope>`;

	return new Promise((resolve, reject) => {
		const options = Object.assign({
			url: 'http://dynamics.sandisk.com/Dynamics/AppWebServices/DocumentManagementWebService.asmx', 
			headers: { 'Content-Type': 'text/xml' }, 
			body: genPayload(did)
		}, auth.options);
		httpntlm.post(options, (err, res) => {
			if(err) return reject(err);
			if(res && res.body) resolve(res.body);
			else reject(`Cannot find sharepointdocumentlocation`);
		});
	});
}

function parseLocationUrl(xml) {
	return new Promise((resolve, reject) => {
		let arr = '';
		const parser = new htmlparser.Parser({
			ontext: text => arr = text,
			onend: () => resolve(arr)
		}, {decodeEntities: true});
		parser.write(xml);
		parser.end();
	});
}

async function getDocLocation(otype, uid) {
	const docPageUrl = getDocPageUrl(otype, uid);
	const locId = await querySharepointLocationID(docPageUrl); //console.log({locId});
	const xml = await querySharepointLocation(locId);					//console.log({xml});
	const sharepointUrl = await parseLocationUrl(xml);				//console.log({sharepointUrl});
	return sharepointUrl;
}

function pageContent(url) {
	return new Promise((resolve, reject) => {
		httpntlm.get(Object.assign({ url }, auth.options), (err, res) => {
			if (! res || res.statusCode === 401) reject(err);
			else resolve(res.body);
		});
	});
}

function fileList(pageBody) {
	const $ = cheerio.load(pageBody);
	const dom = $('a[onfocus="OnLink(this)"]', '#aspnetForm');
	const files = {};
	Object.keys(dom)
		.filter(fd => !isNaN(fd))
		.forEach(fd => {
			const filePath = dom[fd].attribs.href;
			files[path.basename(filePath)] = `http://sprocketus.sandisk.com${filePath}`;
		});
	return files;
}

async function getDocumentList(otype, uid) {
	try {
		const sharepointUrl = await getDocLocation(otype, uid); //console.log(sharepointUrl);
		const found = sharepointUrl.match(/\/sites\/.*/);
		const sprocketURI = encodeURIComponent(found ? found[0] : '');
		const requesType = otype === 10173 ? 'zsd_screquest' : 'zsd_tcrrequest';
		const url = `http://sprocketus.sandisk.com/sites/engdyncrm/${requesType}/Forms/AllItems.aspx?RootFolder=${encodeParentheses(sprocketURI)}`;
		const content = await pageContent(url);
		const list = fileList(content);
		return list;
	} catch(e) {
		console.error(e);
		return {};
	}
}

if(require.main === module) {
	(async () => {
		console.log(await getDocumentList(10173, '7CE1A75F-2D37-E811-80E4-005056AB451F'));
	})();
}

exports.getDocumentList = getDocumentList;
