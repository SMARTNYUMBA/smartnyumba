export default function App() {
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const email = formData.get('email')?.trim() || '';
    const phone = formData.get('phone')?.trim() || '';
    const password = formData.get('password') || '';

    console.log('Values:', { email, phone, password });

    if (!email && !phone) {
      alert('Please enter email or phone');
      return;
    }

    if (!password) {
      alert('Please enter password');
      return;
    }

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    try {
      const response = await fetch('http://localhost:3002/api/auth/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ email: email || null, phone: phone || null, password }),
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        alert('Error: ' + (data.message || data.error));
        btn.disabled = false;
        btn.textContent = 'Login';
        return;
      }

      if (data.token) {
        localStorage.setItem('token', data.token);
        alert('✅ Login successful!');
        e.target.reset();
      }
    } catch (err) {
      alert('Error: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  };

  return (
    <div style={{ backgroundColor: '#0f1117', color: '#e8eaf0', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: '12px', padding: '40px', maxWidth: '450px', width: '100%' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>SmartNyumba</h1>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px', display: 'block' }}>Email or Phone</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input name="email" type="email" placeholder="Email" style={{ flex: 1, background: '#0f1117', border: '1px solid #2a2d3a', color: '#e8eaf0', padding: '12px', borderRadius: '8px' }} />
              <input name="phone" type="tel" placeholder="Phone" style={{ flex: 1, background: '#0f1117', border: '1px solid #2a2d3a', color: '#e8eaf0', padding: '12px', borderRadius: '8px' }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px', display: 'block' }}>Password</label>
            <input name="password" type="password" placeholder="Enter password" style={{ width: '100%', background: '#0f1117', border: '1px solid #2a2d3a', color: '#e8eaf0', padding: '12px', borderRadius: '8px', boxSizing: 'border-box' }} />
          </div>

          <button type="submit" style={{ background: '#6c63ff', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginTop: '10px' }}>
            Login
          </button>
        </form>

        <div style={{ marginTop: '25px', padding: '15px', background: '#20232f', borderRadius: '8px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
          ✅ Backend: http://localhost:3002 | Frontend: http://localhost:5173
        </div>
      </div>
    </div>
  );
}