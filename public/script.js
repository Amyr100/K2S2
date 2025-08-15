document.addEventListener('DOMContentLoaded', () => {
    let isLogin = true;
    const title = document.getElementById('modal-title');
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    const message = document.getElementById('message');
    const submitBtn = document.getElementById('submit-btn');
    const switchBtn = document.getElementById('switch-btn');

    submitBtn.addEventListener('click', async () => {
        const url = isLogin ? '/api/login' : '/api/register';
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.value, password: password.value })
            });
            const data = await res.json();
            message.textContent = data.message;
            message.style.color = res.ok ? 'lightgreen' : 'red';
        } catch (err) {
            message.textContent = 'Ошибка соединения с сервером';
            message.style.color = 'red';
        }
    });

    switchBtn.addEventListener('click', () => {
        isLogin = !isLogin;
        title.textContent = isLogin ? 'Вход' : 'Регистрация';
        switchBtn.textContent = isLogin ? 'Регистрация' : 'Вход';
        message.textContent = '';
    });
});