document.getElementById('captureButton').addEventListener('click', function() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const preview = document.getElementById('preview');

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
            video.srcObject = stream;
            video.play();

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
                    preview.textContent = text;
                });
            });
        })
        .catch(err => {
            console.error("Error accessing the camera: ", err);
        });
});

document.getElementById('reimbursementForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const formData = new FormData(this);
    formData.append('image', dataURItoBlob(formData.get('imageData')));

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
