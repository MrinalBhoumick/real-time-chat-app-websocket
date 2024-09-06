import boto3
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

# In-memory storage for connection IDs and usernames
NAMES_DB = {}

# Replace with your actual endpoint
ENDPOINT = 'fekge9j1k4.execute-api.ap-south-1.amazonaws.com/production'
client = boto3.client('apigatewaymanagementapi', endpoint_url=f"https://{ENDPOINT}")

def send_to_one(connection_id, body):
    try:
        client.post_to_connection(ConnectionId=connection_id, Data=json.dumps(body).encode('utf-8'))
    except Exception as e:
        logger.error(f"Failed to send message to connection {connection_id}: {e}")

def send_to_all(connection_ids, body):
    for connection_id in connection_ids:
        send_to_one(connection_id, body)

def connect():
    logger.info('New connection established')
    return {}

def disconnect(connection_id):
    logger.info(f"Connection {connection_id} disconnected")
    if connection_id in NAMES_DB:
        username = NAMES_DB[connection_id]
        send_to_all(NAMES_DB.keys(), {'systemMessage': f"{username} has left the chat"})
        del NAMES_DB[connection_id]
        send_to_all(NAMES_DB.keys(), {'members': list(NAMES_DB.values())})
    return {}

def set_name(connection_id, name):
    NAMES_DB[connection_id] = name
    logger.info(f"Name set for connection {connection_id}: {name}")
    send_to_all(NAMES_DB.keys(), {'members': list(NAMES_DB.values())})
    send_to_all(NAMES_DB.keys(), {'systemMessage': f"{name} has joined the chat"})
    return {}

def send_public(connection_id, message):
    logger.info(f"Public message from {connection_id}: {message}")
    send_to_all(NAMES_DB.keys(), {'publicMessage': f"{NAMES_DB[connection_id]}: {message}"})
    return {}

def send_private(connection_id, to_user, message):
    to_connection_id = next((key for key, value in NAMES_DB.items() if value == to_user), None)
    if to_connection_id:
        logger.info(f"Private message from {connection_id} to {to_connection_id}: {message}")
        send_to_one(to_connection_id, {'privateMessage': f"{NAMES_DB[connection_id]}: {message}"})
    else:
        logger.error(f"User {to_user} not found for private message from {connection_id}")
        send_to_one(connection_id, {'errorMessage': f"User {to_user} not found."})
    return {}

def lambda_handler(event, context):
    if 'requestContext' not in event:
        return {}

    connection_id = event['requestContext']['connectionId']
    route_key = event['requestContext']['routeKey']
    body = json.loads(event.get('body', '{}'))

    logger.info(f"Received event: {route_key} for connection {connection_id}")

    if route_key == '$connect':
        connect()
    elif route_key == '$disconnect':
        disconnect(connection_id)
    elif route_key == 'setName':
        set_name(connection_id, body.get('name'))
    elif route_key == 'sendPublic':
        send_public(connection_id, body.get('message'))
    elif route_key == 'sendPrivate':
        send_private(connection_id, body.get('to'), body.get('message'))
    else:
        logger.info(f"Unknown route: {route_key}")

    return {}

# Example CloudWatch log
logger.info("Public message from dsgA3dgABcwCG8g=: Guys lets discuss the task")
