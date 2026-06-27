const SENSITIVE_TECHNICAL_REQUEST = /(?:source\s*code|database\s*(?:schema|credential|password)|sql\s*(?:query|dump)|api\s*(?:key|secret|endpoint)|infrastructure|server\s*configuration|environment\s*variable|access\s*token|jwt|private\s*key|deployment\s*configuration|hosting\s*credential|internal\s*file\s*path)/i;

const isSensitiveTechnicalRequest = (message) => SENSITIVE_TECHNICAL_REQUEST.test(String(message || ''));

module.exports = { isSensitiveTechnicalRequest };
