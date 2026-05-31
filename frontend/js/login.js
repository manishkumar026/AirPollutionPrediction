/* ============================================================
   AIRWATCH PRO - PREMIUM AUTH LOGIC
   ============================================================ */

document.addEventListener('DOMContentLoaded', function() {
    initThreeBackground();
    initAuthFlow();
    initPasswordToggles();
    
    // Social Login buttons handler
    document.querySelectorAll('.social-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const provider = this.querySelector('img') ? this.querySelector('img').alt : 'Social';
            showToast(`${provider} Login is a premium mockup feature. Please use username & password to sign in!`, 'info');
        });
    });
});

/**
 * Enhanced Three.js background with subtle, high-end particles
 */
function initThreeBackground() {
    const container = document.getElementById('three-canvas-container');
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Create Particles
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 2000;
    const posArray = new Float32Array(particlesCount * 3);
    const scaleArray = new Float32Array(particlesCount);

    for (let i = 0; i < particlesCount; i++) {
        posArray[i * 3] = (Math.random() - 0.5) * 10;
        posArray[i * 3 + 1] = (Math.random() - 0.5) * 10;
        posArray[i * 3 + 2] = (Math.random() - 0.5) * 10;
        scaleArray[i] = Math.random();
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    particlesGeometry.setAttribute('scale', new THREE.BufferAttribute(scaleArray, 1));

    const particlesMaterial = new THREE.PointsMaterial({
        size: 0.015,
        color: '#00e5ff',
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });

    const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particlesMesh);

    camera.position.z = 3;

    // Mouse Interaction
    let mouseX = 0;
    let mouseY = 0;

    document.addEventListener('mousemove', (event) => {
        mouseX = (event.clientX / window.innerWidth - 0.5);
        mouseY = (event.clientY / window.innerHeight - 0.5);
    });

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        
        particlesMesh.rotation.y += 0.0005;
        particlesMesh.rotation.x += 0.0002;

        // Subtle movement based on mouse
        camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.05;
        camera.position.y += (-mouseY * 0.5 - camera.position.y) * 0.05;
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
    }

    animate();

    // Resize handler
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

/**
 * Handle Tab switching and Form submissions
 */
function initAuthFlow() {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const indicator = document.querySelector('.tab-indicator');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    // Tab Switching
    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        indicator.style.transform = 'translateX(0)';
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    });

    tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        indicator.style.transform = 'translateX(100%)';
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
    });

    // Login Submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        setLoading(btn, true);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                showToast('Welcome back, ' + data.user.username + '!', 'success');
                setTimeout(() => window.location.href = '/', 1000);
            } else {
                showToast(data.message || 'Invalid credentials', 'error');
                setLoading(btn, false);
            }
        } catch (err) {
            console.error('Login error:', err);
            showToast('Connection failed. Please try again.', 'error');
            setLoading(btn, false);
        }
    });

    // Register Submission
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('reg-btn');
        const email = document.getElementById('reg-email').value;
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-confirm').value;

        if (password !== confirm) {
            showToast('Passwords do not match', 'error');
            return;
        }

        setLoading(btn, true);

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                showToast('Account created! You can now sign in.', 'success');
                setTimeout(() => {
                    setLoading(btn, false);
                    tabLogin.click();
                }, 1500);
            } else {
                showToast(data.message || 'Registration failed', 'error');
                setLoading(btn, false);
            }
        } catch (err) {
            console.error('Register error:', err);
            showToast('Connection failed. Please try again.', 'error');
            setLoading(btn, false);
        }
    });
}

/**
 * Toggle password visibility
 */
function initPasswordToggles() {
    document.querySelectorAll('.toggle-password').forEach(icon => {
        icon.addEventListener('click', function() {
            const input = this.parentElement.querySelector('input');
            if (input.type === 'password') {
                input.type = 'text';
                this.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                this.classList.replace('fa-eye-slash', 'fa-eye');
            }
        });
    });
}

/**
 * Loading state for buttons
 */
function setLoading(btn, isLoading) {
    if (isLoading) {
        btn.classList.add('loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

