const menuBtn = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');
const menuItems = document.querySelectorAll('.sidebar-menu li');
const sections = document.querySelectorAll('.content-section');

if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        sidebar.classList.toggle('active'); 
    });
}
document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('active') && !sidebar.contains(e.target) && e.target !== menuBtn) {
        sidebar.classList.remove('active');
    }
});

menuItems.forEach(item => {
    item.addEventListener('click', () => {
        menuItems.forEach(el => el.classList.remove('active')); 
        item.classList.add('active');
        sections.forEach(sec => sec.classList.remove('active'));
        const targetSec = document.getElementById(item.getAttribute('data-target'));
        if (targetSec) targetSec.classList.add('active');
        if (window.innerWidth <= 850 && sidebar) sidebar.classList.remove('active');
    });
});

function showToast(message, type = "success") {
    let container = document.querySelector('.toast-container') || document.createElement('div');
    container.className = 'toast-container'; 
    document.body.appendChild(container);
    
    const toast = document.createElement('div'); 
    toast.className = 'toast-notification';
    if(type !== 'success') toast.style.borderLeftColor = 'var(--danger)';
    
    toast.innerHTML = `<span style="font-size:20px;">${type==='success'?'✅':'⚠️'}</span><div><strong style="display:block;font-size:14px;color:var(--text-header)">Hệ thống</strong><span style="font-size:13px;color:var(--text-muted);">${message}</span></div>`;
    
    container.appendChild(toast);
    setTimeout(() => { 
        toast.style.animation = "slideIn 0.3s ease reverse forwards"; 
        setTimeout(() => toast.remove(), 300); 
    }, 3000);
}

const btnVi = document.getElementById('btn-lang-vi'); 
const btnEn = document.getElementById('btn-lang-en');

function setLanguage(lang) {
    localStorage.setItem('preferred_lang', lang);
    if(btnVi && btnEn) {
        btnVi.className = lang === 'vi' ? 'active' : '';
        btnEn.className = lang === 'en' ? 'active' : '';
    }
    document.querySelectorAll('[data-vi]').forEach(el => {
        const text = el.getAttribute(`data-${lang}`);
        if (text) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = text;
            else el.innerHTML = text;
        }
    });
}
if(btnVi) btnVi.addEventListener('click', () => setLanguage('vi')); 
if(btnEn) btnEn.addEventListener('click', () => setLanguage('en'));

const buttonsContainer = document.getElementById('buttons-container');
const addButtonBtn = document.getElementById('add-button-btn');

function createButtonRow(id = '', label = 'Support', style = 'Primary') {
    const btnId = id || 'btn_' + Math.random().toString(36).substr(2, 9);
    const div = document.createElement('div'); 
    div.className = 'feature-card'; 
    div.style.padding = '15px';
    div.style.marginBottom = '15px';
    div.style.position = 'relative';
    div.style.backgroundColor = 'var(--bg-base)';
    
    div.innerHTML = `
        <button type="button" onclick="this.parentElement.remove()" style="position:absolute; top:10px; right:15px; background:none; border:none; color:var(--danger); cursor:pointer; font-size:20px;">×</button>
        <div class="form-grid">
            <div class="form-group"><label>Label nút</label><input type="text" class="form-control btn-label" value="${label}" required></div>
            <div class="form-group"><label>Màu sắc</label><select class="form-control btn-style"><option value="Primary" ${style==='Primary'?'selected':''}>Blurple</option><option value="Secondary" ${style==='Secondary'?'selected':''}>Xám</option><option value="Success" ${style==='Success'?'selected':''}>Xanh Lá</option><option value="Danger" ${style==='Danger'?'selected':''}>Đỏ</option></select></div>
        </div>
        <div class="form-group" style="margin-bottom:0;"><label>Custom ID</label><input type="text" class="form-control btn-custom-id" value="${btnId}" readonly></div>
    `;
    if (buttonsContainer) buttonsContainer.appendChild(div);
}
createButtonRow('btn_general', 'Tạo Ticket', 'Primary');
if (addButtonBtn) addButtonBtn.addEventListener('click', () => createButtonRow());

const pickr = Pickr.create({
    el: '#ticket-color-picker', theme: 'monolith', default: '#5865F2',
    swatches: ['#5865F2', '#da373c', '#23a559', '#F5A623', '#000000', '#FFFFFF'],
    components: { preview: true, opacity: true, hue: true, interaction: { hex: true, input: true, save: true } },
    i18n: { 'btn:save': 'Save' }
});
pickr.on('save', (color) => { 
    document.getElementById('ticket-color-value').value = color.toHEXA().toString(); 
    pickr.hide(); 
});

const urlParams = new URLSearchParams(window.location.search);
const urlGuildId = urlParams.get('guildId');

if (urlGuildId) {
    ['menu-ticket', 'menu-welcome', 'menu-autorole', 'menu-reactrole'].forEach(id => {
        const el = document.getElementById(id); 
        if (el) el.style.display = 'flex';
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const savedLang = localStorage.getItem('preferred_lang') || 'vi'; 
    setLanguage(savedLang);
    const loadingContainer = document.getElementById('loading-container');
    const guildGrid = document.getElementById('guild-grid');

    try {
        const res = await fetch('/api/user/guilds');
        if (loadingContainer) loadingContainer.style.display = 'none';

        if (!res.ok) { 
            if (guildGrid) guildGrid.innerHTML = `<div style="color:var(--danger); padding:20px;">⚠️ Lỗi phiên đăng nhập. Hãy <a href="/public/login" style="color:var(--accent);">Đăng nhập lại</a>.</div>`; 
            return; 
        }

        const guilds = await res.json();
        
        if (guildGrid) {
            guildGrid.innerHTML = guilds.map(g => `
                <div class="guild-card">
                    ${g.icon ? `<img class="guild-icon" src="${g.icon}">` : `<div class="guild-icon">${g.name.charAt(0)}</div>`}
                    <div class="guild-name">${g.name}</div>
                    ${g.botInstalled ? `<a href="/public/config.html?guildId=${g.id}" class="btn btn-primary">Manage Server</a>` : `<a href="https://discord.com/api/oauth2/authorize?client_id=1491052906496131296&permissions=8&scope=bot&guild_id=${g.id}" target="_blank" class="btn btn-secondary">Invite Bot</a>`}
                </div>
            `).join('');
        }
    } catch (err) {}

    if (urlGuildId) {
        try {
            const chRes = await fetch(`/api/guilds/${urlGuildId}/channels`);
            if (chRes.ok) {
                const channels = await chRes.json(); 
                const opts = channels.map(ch => `<option value="${ch.id}"># ${ch.name}</option>`).join('');
                document.getElementById('ticket-channel').innerHTML = '<option value="">-- Chọn kênh --</option>' + opts;
                document.getElementById('config-welcome-channel').innerHTML = '<option value="">-- Chọn kênh --</option>' + opts;
            }
            const rRes = await fetch(`/api/guilds/${urlGuildId}/roles`);
            if (rRes.ok) {
                const roles = await rRes.json(); 
                const opts = roles.map(r => `<option value="${r.id}">@ ${r.name}</option>`).join('');
                document.getElementById('ticket-role').innerHTML = '<option value="">-- Chọn Role --</option>' + opts;
                document.getElementById('config-auto-role').innerHTML = '<option value="">-- Chọn Role --</option>' + opts;
                document.getElementById('config-react-role').innerHTML = '<option value="">-- Chọn Role --</option>' + opts;
            }
        } catch (err) {}
    }
});

async function sendPayload(url, data, msg) {
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.ok) showToast(msg); else showToast("Lỗi lưu cấu hình.", "error");
    } catch (err) { showToast("Lỗi kết nối.", "error"); }
}

document.getElementById('ticket-form').addEventListener('submit', (e) => {
    e.preventDefault(); 
    const buttons = []; 
    document.querySelectorAll('.ticket-button-item, .feature-card .btn-custom-id').forEach(item => { 
        const parent = item.closest('.feature-card');
        if(parent) {
            buttons.push({ 
                customId: parent.querySelector('.btn-custom-id').value, 
                label: parent.querySelector('.btn-label').value, 
                style: parent.querySelector('.btn-style').value
            }); 
        }
    });
    sendPayload(`/api/guilds/${urlGuildId}/ticket-config`, { channelId: document.getElementById('ticket-channel').value, roleId: document.getElementById('ticket-role').value, author: document.getElementById('ticket-author').value, title: document.getElementById('ticket-title').value, desc: document.getElementById('ticket-desc').value, footer: document.getElementById('ticket-footer').value, color: document.getElementById('ticket-color-value').value, buttons }, "Đã lưu cài đặt Ticket!");
});

document.getElementById('welcome-form').addEventListener('submit', (e) => { 
    e.preventDefault(); 
    sendPayload(`/api/guilds/${urlGuildId}/ticket-config`, { welcomeChannelId: document.getElementById('config-welcome-channel').value, welcomeMessage: document.getElementById('config-welcome-msg').value }, "Đã lưu Welcome Module!"); 
});

document.getElementById('autorole-form').addEventListener('submit', (e) => { 
    e.preventDefault(); 
    sendPayload(`/api/guilds/${urlGuildId}/ticket-config`, { autoRoleId: document.getElementById('config-auto-role').value }, "Đã lưu Auto Role!"); 
});

document.getElementById('reactrole-form').addEventListener('submit', (e) => { 
    e.preventDefault(); 
    sendPayload(`/api/guilds/${urlGuildId}/ticket-config`, { reactRoleId: document.getElementById('config-react-role').value }, "Đã lưu Reaction Role!"); 
});
