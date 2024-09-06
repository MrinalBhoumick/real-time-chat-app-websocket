import AWS from 'aws-sdk';
import crypto from 'crypto';

let NAMES_DB = {}; 

const ENDPOINT = 'fekge9j1k4.execute-api.ap-south-1.amazonaws.com/production';
const client = new AWS.ApiGatewayManagementApi({ endpoint: ENDPOINT });

const algorithm = 'aes-256-cbc';
const secretKey = '531aad4233488f74908037354a176621c6c88286135b8ded8b58138a9da60988';
const iv = crypto.randomBytes(16);

const encrypt = (text) => {
    let cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
};

const decrypt = (iv, encryptedText) => {
    let ivBuffer = Buffer.from(iv, 'hex');
    let encryptedTextBuffer = Buffer.from(encryptedText, 'hex');
    let decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), ivBuffer);
    let decrypted = decipher.update(encryptedTextBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
};

const sendToOne = async (id, body) => {
    try {
        const { iv, encryptedData } = encrypt(JSON.stringify(body));
        await client.postToConnection({
            'ConnectionId': id,
            'Data': Buffer.from(JSON.stringify({ iv, encryptedData })),
        }).promise();
    } catch (err) {
        console.error(`Failed to send message to connection ${id}:`, err);
    }
};

const sendToAll = async (ids, body) => {
    const all = ids.map(i => sendToOne(i, body));
    return Promise.all(all);
};

const $connect = async () => {
    console.log('New connection established');
    return {};
};

const $disconnect = async (payload, meta) => {
    console.log(`Connection ${meta.connectionId} disconnected`);
    await sendToAll(Object.keys(NAMES_DB), { systemMessage: `${NAMES_DB[meta.connectionId]} has left the chat` });
    delete NAMES_DB[meta.connectionId];
    await sendToAll(Object.keys(NAMES_DB), { members: Object.values(NAMES_DB) });
    return {};
};

const setName = async (payload, meta) => {
    NAMES_DB[meta.connectionId] = payload.name;
    console.log(`Name set for connection ${meta.connectionId}: ${payload.name}`);
    await sendToAll(Object.keys(NAMES_DB), { members: Object.values(NAMES_DB) });
    await sendToAll(Object.keys(NAMES_DB), { systemMessage: `${NAMES_DB[meta.connectionId]} has joined the chat` });
    return {};
};

const sendPublic = async (payload, meta) => {
    console.log(`Public message from ${meta.connectionId}: ${payload.message}`);
    await sendToAll(Object.keys(NAMES_DB), { publicMessage: `${NAMES_DB[meta.connectionId]}: ${payload.message}` });
    return {};
};

const sendPrivate = async (payload, meta) => {
    const to = Object.keys(NAMES_DB).find(key => NAMES_DB[key] === payload.to);
    if (to) {
        console.log(`Private message from ${meta.connectionId} to ${to}: ${payload.message}`);
        await sendToOne(to, { privateMessage: `${NAMES_DB[meta.connectionId]}: ${payload.message}` });
    } else {
        console.error(`User ${payload.to} not found for private message from ${meta.connectionId}`);
        await sendToOne(meta.connectionId, { errorMessage: `User ${payload.to} not found.` });
    }
    return {};
};

export const handler = async (event) => {
    if (!event.requestContext) {
        return {};
    }

    try {
        const connectionId = event.requestContext.connectionId;
        const routeKey = event.requestContext.routeKey;
        const body = JSON.parse(event.body || '{}');

        console.log(`Received event: ${routeKey} for connection ${connectionId}`);

        switch (routeKey) {
        case '$connect':
            await $connect();
            break;
        case '$disconnect':
            await $disconnect(body, { connectionId });
            break;
        case 'setName':
            await setName(body, { connectionId });
            break;
        case 'sendPublic':
            await sendPublic(body, { connectionId });
            break;
        case 'sendPrivate':
            await sendPrivate(body, { connectionId });
            break;
        default:
            console.log(`Unknown route: ${routeKey}`);
            break;
        }
    } catch (err) {
        console.error('Error handling event:', err);
    }

    return {};
};
