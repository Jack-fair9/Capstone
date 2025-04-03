document.getElementById('signupForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const email = document.getElementById('email').value;
    const phoneNumber = document.getElementById('phoneNumber').value;
    const password = document.getElementById('password').value;

    const messageElement = document.getElementById('message');
    messageElement.textContent = '';

    try {
        const response = await fetch('http://localhost:3000/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, email, phoneNumber, password })
        });

        const result = await response.json();
        if (response.ok) {
            messageElement.textContent = result.message;
            messageElement.style.color = 'green';
        } else {
            messageElement.textContent = result.message;
            messageElement.style.color = 'red';
        }
    } catch (error) {
        console.error('Error submitting form:', error);
        messageElement.textContent = 'An error occurred. Please try again.';
        messageElement.style.color = 'red';
    }
});
