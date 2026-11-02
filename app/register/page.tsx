'use client';
import { useState } from 'react';
import { api, useData } from '@/components/ui';

export default function Register() {
  const [role, setRole] = useState('RESTAURANT');
  const [err, setErr] = useState('');
  const [cats] = useData<any[]>('categories');
  return (
    <main style={{ maxWidth: 520 }}>
      <section>
        <h2>Create an account</h2>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const f: any = Object.fromEntries(fd);
          const location = { address_line1: f.address_line1, city: f.city, state: f.state,
            postal_code: f.postal_code, latitude: f.latitude, longitude: f.longitude };
          const payload = { role, full_name: f.full_name, email: f.email, password: f.password, phone: f.phone,
            ...(role === 'RESTAURANT' && { business_name: f.business_name, location }),
            ...(role === 'NGO' && { organization_name: f.organization_name, capacity_kg: f.capacity_kg,
              category_ids: fd.getAll('category_ids').map(Number), location }),
            ...(role === 'VOLUNTEER' && { vehicle_type: f.vehicle_type }) };
          try { const r = await api('auth/register', 'POST', payload); window.location.href = '/' + r.role.toLowerCase(); }
          catch (x: any) { setErr(x.message); }
        }}>
          <label>I am a
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="RESTAURANT">Restaurant / food provider</option>
              <option value="NGO">NGO / recipient organisation</option>
              <option value="VOLUNTEER">Volunteer</option>
            </select>
          </label>
          <label>Full name<input name="full_name" required minLength={2} /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Password (min 8)<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
          <label>Phone<input name="phone" /></label>
          {role === 'RESTAURANT' && <label>Business name<input name="business_name" required /></label>}
          {role === 'NGO' && <>
            <label>Organisation name<input name="organization_name" required /></label>
            <label>Capacity (kg)<input name="capacity_kg" type="number" min="1" step="0.01" required /></label>
            <fieldset><legend className="muted">Accepted food categories</legend>
              {cats?.map((c) => <label key={c.category_id} style={{ display: 'flex', gap: 6 }}>
                <input type="checkbox" name="category_ids" value={c.category_id} />{c.name}</label>)}
            </fieldset>
          </>}
          {role === 'VOLUNTEER' && <label>Vehicle<input name="vehicle_type" placeholder="Bike / Car / Van" /></label>}
          {role !== 'VOLUNTEER' && <>
            <label>Address<input name="address_line1" required /></label>
            <label>City<input name="city" required defaultValue="Bengaluru" /></label>
            <label>State<input name="state" required defaultValue="Karnataka" /></label>
            <label>Postal code<input name="postal_code" required /></label>
            <label>Latitude<input name="latitude" type="number" step="0.000001" min="-90" max="90" required defaultValue="12.97" /></label>
            <label>Longitude<input name="longitude" type="number" step="0.000001" min="-180" max="180" required defaultValue="77.59" /></label>
          </>}
          {err && <p className="err" role="alert">{err}</p>}
          <button>Register</button>
        </form>
        <p><a href="/login">Back to log in</a></p>
      </section>
    </main>
  );
}
