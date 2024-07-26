document.getElementById('captureButton').addEventListener('click', function() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const preview = document.getElementById('preview');

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
            video.srcObject = stream;
            video.play();

            // Capture the image when the video is clicked
            video.addEventListener('click', () => {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = canvas.toDataURL('image/png');
                document.getElementById('imageData').value = imageData;

                // Stop the video stream after capturing the image
                stream.getTracks().forEach(track => track.stop());

                // Process the image with OCR and display the result
                Tesseract.recognize(
                    imageData,
                    'eng',
                    {
                        logger: m => console.log(m)
                    }
                ).then(({ data: { text } }) => {
                    const parsedData = parseOCRResult(text);
                    preview.innerHTML = `
                        <b>OCR Result:</b><br>
                        <b>OR Number:</b> ${parsedData.orNumber}<br>
                        <b>Date:</b> ${parsedData.date}<br>
                        <b>Time:</b> ${parsedData.time}<br>
                        <b>Amount Paid:</b> ${parsedData.amountPaid}<br>
                    `;
                });
            });
        })
        .catch(err => {
            console.error("Error accessing the camera: ", err);
        });
});

document.getElementById('submitButton').addEventListener('click', async function(event) {
    event.preventDefault();

    const formData = new FormData(document.getElementById('reimbursementForm'));
    formData.append('image', dataURItoBlob(document.getElementById('imageData').value));

    const response = await fetch('http://localhost:5000/submit', {
        method: 'POST',
        body: formData
    });

    const result = await response.json();
    alert(`Status: ${result.status}, Updated Range: ${result.updatedRange}`);
});

function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
}

function parseOCRResult(text) {
    // Implement parsing logic for OR number, date, time, and amount paid
    const orNumber = extractORNumber(text);
    const dateTime = extractDateTime(text);
    const amountPaid = extractAmountPaid(text);
    
    const [date, time] = dateTime.split(' ');

    return {
        orNumber,
        date,
        time,
        amountPaid
    };
}

function extractORNumber(text) {
    const orPatterns = [
        /\b(?:ticket number|OR number|official receipt number|official receipt|OR)\b[:\s]*([\w-]+)/i
    ];
    for (const pattern of orPatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return "Unknown OR Number";
}

function extractDateTime(text) {
    const datePatterns = [
        /\b(?:date|time of the ticket|datetime)\b[:\s]*([\d/:-\s]+)/i
    ];
    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return "Unknown Date Time";
}

function extractAmountPaid(text) {
    const amountPatterns = [
        /\b(?:amount paid|total amount paid|total|cash|total cash|total amount)\b[:\s]*([\d.,]+)/i
    ];
    for (const pattern of amountPatterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return "0.00";
}
