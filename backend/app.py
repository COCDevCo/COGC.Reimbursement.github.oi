from flask import Flask, request, jsonify
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import io
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from pymongo import MongoClient
import re
import os

app = Flask(__name__)

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
TOKEN = 'your_google_access_token'  # Replace with your actual access token

# MongoDB connection setup
client = MongoClient('mongodb://localhost:27017/')
db = client['reimbursement_db']
collection = db['reimbursement_forms']

@app.route('/submit', methods=['POST'])
def submit():
    data = request.form
    name = data['name']
    id_number = data['idNumber']
    position = data['position']
    division = data['division']
    team_head = data['teamHead']
    month = data['month']
    pid = data['pid']
    image = request.files['image']

    # Process the image with OCR
    image = Image.open(io.BytesIO(image.read()))
    image = preprocess_image(image)
    text = pytesseract.image_to_string(image)
    or_number = parse_or_number(text)
    date_time = parse_date_time(text)
    amount_paid = parse_amount_paid(text)

    # Split date and time
    date, time = date_time.split()

    # Save data to MongoDB
    document = {
        'name': name,
        'id_number': id_number,
        'position': position,
        'division': division,
        'team_head': team_head,
        'month': month,
        'pid': pid,
        'or_number': or_number,
        'date': date,
        'time': time,
        'amount_paid': amount_paid
    }
    collection.insert_one(document)

    # Construct the spreadsheet title
    spreadsheet_title = f'Petty Cash_{month}'

    # Update or create Google Sheets
    creds = Credentials(token=TOKEN, scopes=SCOPES)
    service = build('sheets', 'v4', credentials=creds)

    # Check if the spreadsheet exists or create a new one
    spreadsheet_id = get_or_create_spreadsheet(service, spreadsheet_title, name, id_number, position, division, team_head)

    # Append the new data
    values = [[pid, or_number, date, time, amount_paid]]
    body = {'values': values}
    result = service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id, range='Sheet1!A8',
        valueInputOption='RAW', body=body).execute()

    update_total_formula(service, spreadsheet_id)

    return jsonify({'status': 'success', 'updatedRange': result['updates']['updatedRange']})

def preprocess_image(image):
    # Convert to grayscale
    image = image.convert('L')
    # Enhance contrast
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(2)
    # Apply a slight blur
    image = image.filter(ImageFilter.MedianFilter())
    return image

def parse_or_number(text):
    # Implement parsing logic for OR number
    or_patterns = [
        r'\b(?:ticket number|OR number|official receipt number|official receipt|OR)\b[:\s]*([\w-]+)',
    ]
    for pattern in or_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return "Unknown OR Number"

def parse_date_time(text):
    # Implement parsing logic for date and time
    date_patterns = [
        r'\b(?:date|time of the ticket|datetime)\b[:\s]*([\d/:-\s]+)',
    ]
    for pattern in date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return "Unknown Date Time"

def parse_amount_paid(text):
    # Implement parsing logic for amount paid
    amount_patterns = [
        r'\b(?:amount paid|total amount paid|total|cash|total cash|total amount)\b[:\s]*([\d.,]+)',
    ]
    for pattern in amount_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return "0.00"

def get_or_create_spreadsheet(service, title, name, id_number, position, division, team_head):
    # Check if the spreadsheet exists by title and return its ID
    try:
        response = service.spreadsheets().get(spreadsheetId=title).execute()
        return response['spreadsheetId']
    except:
        spreadsheet_id = create_spreadsheet(service, title)
        create_template(service, spreadsheet_id, name, id_number, position, division, team_head)
        return spreadsheet_id

def create_spreadsheet(service, title):
    # Create a new spreadsheet
    spreadsheet = {
        'properties': {
            'title': title
        }
    }
    sheet = service.spreadsheets().create(body=spreadsheet).execute()
    return sheet['spreadsheetId']

def create_template(service, spreadsheet_id, name, id_number, position, division, team_head):
    # Create a template with the necessary headers and user details
    template_values = [
        ['Name', 'ID Number', 'Position', 'Division', 'Team Head'],
        [name, id_number, position, division, team_head],
        [],
        [],
        [],
        [],
        [],
        ['PID', 'OR Number', 'Date', 'Time', 'Amount Paid'],
        ['TOTAL', '', '', '', '=SUM(E9:E)']
    ]
    body = {
        'values': template_values
    }
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id, range='Sheet1!A1',
        valueInputOption='RAW', body=body).execute()

def update_total_formula(service, spreadsheet_id):
    # Update the TOTAL formula
    body = {
        'values': [['=SUM(E9:E)']]
    }
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id, range='Sheet1!E8',
        valueInputOption='USER_ENTERED', body=body).execute()

if __name__ == '__main__':
    app.run(debug=True)
