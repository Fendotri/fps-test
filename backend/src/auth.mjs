import crypto from 'node:crypto';

const encoding = 'base64url';

const scryptAsync = (password, salt, keylen) => new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
    });
});

export const hashPassword = async (plainPassword, salt = crypto.randomBytes(16).toString('hex')) => {
    const hashBuffer = await scryptAsync(plainPassword, salt, 64);
    return {
        salt,
        hash: hashBuffer.toString('hex'),
    };
};

export const verifyPassword = async (plainPassword, salt, expectedHash) => {
    const hashBuffer = await scryptAsync(plainPassword, salt, 64);
    const actualHash = hashBuffer.toString('hex');
    const actualBuf = Buffer.from(actualHash, 'hex');
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (actualBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
};

const encodePart = (value) => Buffer.from(JSON.stringify(value)).toString(encoding);
const decodePart = (value) => JSON.parse(Buffer.from(value, encoding).toString('utf8'));

const sign = (value, secret) => crypto.createHmac('sha256', secret).update(value).digest(encoding);

export const issueToken = (payload, secret) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const partA = encodePart(header);
    const partB = encodePart(payload);
    const signature = sign(`${partA}.${partB}`, secret);
    return `${partA}.${partB}.${signature}`;
};

export const verifyToken = (token, secret) => {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [partA, partB, signature] = parts;
    const expected = sign(`${partA}.${partB}`, secret);
    if (expected !== signature) return null;
    try {
        return decodePart(partB);
    } catch {
        return null;
    }
};

export const parseBearerToken = (authorizationHeader) => {
    if (!authorizationHeader || typeof authorizationHeader !== 'string') return null;
    const [type, token] = authorizationHeader.trim().split(/\s+/);
    if (!type || !token || type.toLowerCase() !== 'bearer') return null;
    return token;
};

export const isStrongPassword = (password) => {
    if (typeof password !== 'string' || password.length < 8) return false;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    return hasLower && hasUpper && hasNumber;
};

export const isValidUsername = (username) => (
    typeof username === 'string'
    && /^[A-Za-z0-9_]{3,20}$/.test(username)
);

