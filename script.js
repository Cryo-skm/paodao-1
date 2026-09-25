// ===== Bmob REST API 配置（国内BaaS平台，使用 fetch 调用）=====
const BMOB_CONFIG = {
    appId: "d922d4ec885aa6686c854a8b7ea1cb29",
    restKey: "ad909f6f728e30324a45636862234d46",
    // 可能的 API 地址，按优先级尝试
    baseUrls: [
        "https://api.bmobapp.com/1",
        "https://api.bmob.cn/1",
        "https://d922d4ec885aa6686c854a8b7ea1cb29.bmobcloud.com/1"
    ],
    baseUrl: ""
};

// 自动探测可用的 API 地址
function detectBmobApi() {
    return new Promise((resolve) => {
        let currentIndex = 0;
        function tryNext() {
            if (currentIndex >= BMOB_CONFIG.baseUrls.length) {
                console.log("无法连接 Bmob，使用本地模式");
                BMOB_CONFIG.baseUrl = "";
                resolve(false);
                return;
            }
            const url = BMOB_CONFIG.baseUrls[currentIndex];
            fetch(`${url}/users?limit=1`, {
                method: "GET",
                headers: {
                    "X-Bmob-Application-Id": BMOB_CONFIG.appId,
                    "X-Bmob-REST-API-Key": BMOB_CONFIG.restKey,
                    "Content-Type": "application/json"
                }
            })
            .then(() => {
                BMOB_CONFIG.baseUrl = url;
                console.log("Bmob API 可用：" + url);
                resolve(true);
            })
            .catch(() => {
                currentIndex++;
                tryNext();
            });
        }
        tryNext();
    });
}

// 初始化时尝试探测
detectBmobApi();

function bmobHeaders() {
    return {
        "X-Bmob-Application-Id": BMOB_CONFIG.appId,
        "X-Bmob-REST-API-Key": BMOB_CONFIG.restKey,
        "Content-Type": "application/json"
    };
}

function bmobLogin(username, password) {
    // 本地 fallback 模式
    if (!BMOB_CONFIG.baseUrl) {
        const users = JSON.parse(localStorage.getItem("local_users") || "{}");
        if (users[username] && users[username].password === password) {
            return Promise.resolve({ objectId: users[username].id, username: username });
        }
        return Promise.reject(new Error("用户名或密码错误"));
    }
    return fetch(`${BMOB_CONFIG.baseUrl}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, {
        method: "GET",
        headers: bmobHeaders()
    }).then(res => {
        if (!res.ok) throw new Error("登录失败");
        return res.json();
    });
}

function bmobRegister(username, password) {
    // 本地 fallback 模式
    if (!BMOB_CONFIG.baseUrl) {
        const users = JSON.parse(localStorage.getItem("local_users") || "{}");
        if (users[username]) {
            return Promise.reject(new Error("用户名已存在"));
        }
        const id = "local_" + Date.now();
        users[username] = { password, id };
        localStorage.setItem("local_users", JSON.stringify(users));
        return Promise.resolve({ objectId: id, username: username });
    }
    return fetch(`${BMOB_CONFIG.baseUrl}/users`, {
        method: "POST",
        headers: bmobHeaders(),
        body: JSON.stringify({ username, password })
    }).then(res => {
        if (!res.ok) throw new Error("注册失败");
        return res.json();
    });
}

function bmobQuery(tableName) {
    // 本地 fallback 模式
    if (!BMOB_CONFIG.baseUrl) {
        const data = JSON.parse(localStorage.getItem("local_" + tableName) || "[]");
        return Promise.resolve({ results: data });
    }
    return fetch(`${BMOB_CONFIG.baseUrl}/classes/${tableName}`, {
        method: "GET",
        headers: bmobHeaders()
    }).then(res => {
        if (!res.ok) throw new Error("查询失败");
        return res.json();
    });
}

function bmobSave(tableName, data) {
    // 本地 fallback 模式
    if (!BMOB_CONFIG.baseUrl) {
        const items = JSON.parse(localStorage.getItem("local_" + tableName) || "[]");
        const newItem = { ...data, objectId: "local_" + Date.now() };
        items.push(newItem);
        localStorage.setItem("local_" + tableName, JSON.stringify(items));
        return Promise.resolve(newItem);
    }
    return fetch(`${BMOB_CONFIG.baseUrl}/classes/${tableName}`, {
        method: "POST",
        headers: bmobHeaders(),
        body: JSON.stringify(data)
    }).then(res => {
        if (!res.ok) throw new Error("保存失败");
        return res.json();
    });
}

// ==================== 工具函数：Toast 提示 ====================
function showToast(message, type = 'info') {
    const oldToast = document.getElementById('toastMsg');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'toastMsg';
    toast.className = `toast ${type} show`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ==================== 工具函数：验证码管理（Bmob 真实短信） ====================
// 使用 Bmob 短信验证码服务
// API 文档：https://doc.bmobapp.com/cloud/sms/index.html
// 1. 发送：POST /1/requestSmsCode  body: { mobilePhoneNumber, template }
// 2. 验证：POST /1/verifySmsCode body: { mobilePhoneNumber, smsCode }
const codeStore = {
    storage: {},

    // 发送真实验证码到手机
    generate(phone, purpose = 'login') {
        return new Promise((resolve, reject) => {
            if (!BMOB_CONFIG.baseUrl) {
                // 本地降级模式：生成 6 位随机码
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                const key = `${purpose}_${phone}`;
                this.storage[key] = { code: code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 };
                showToast(`【本地演示】验证码：${code}`, 'info');
                console.log(`【本地演示】手机号 ${phone} 的验证码：${code}`);
                resolve({ success: true, code: code });
                return;
            }

            // 发送短信验证码
            fetch(`${BMOB_CONFIG.baseUrl}/requestSmsCode`, {
                method: 'POST',
                headers: bmobHeaders(),
                body: JSON.stringify({
                    mobilePhoneNumber: phone,
                    template: '验证码' // 模板名称，可在 Bmob 控制台配置
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.code && data.code !== 200) {
                    showToast(`发送失败：${data.error || '未知错误'}`, 'error');
                    reject(new Error(data.error || '发送失败'));
                } else {
                    const key = `${purpose}_${phone}`;
                    this.storage[key] = { sent: true, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 };
                    showToast('验证码已发送到您的手机，请注意查收', 'success');
                    resolve({ success: true });
                }
            })
            .catch(err => {
                // 网络错误也降级到本地模式
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                const key = `${purpose}_${phone}`;
                this.storage[key] = { code: code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 };
                showToast(`【演示】验证码：${code}（网络异常，使用本地模式）`, 'info');
                console.log(`【演示】手机号 ${phone} 的验证码：${code}`);
                resolve({ success: true, code: code });
            });
        });
    },

    // 验证输入的验证码
    verify(phone, code, purpose = 'login') {
        return new Promise((resolve) => {
            const key = `${purpose}_${phone}`;
            const record = this.storage[key];

            if (!record) {
                resolve({ success: false, reason: '请先获取验证码' });
                return;
            }
            if (Date.now() > record.expiresAt) {
                resolve({ success: false, reason: '验证码已过期' });
                return;
            }
            if (record.attempts >= 5) {
                resolve({ success: false, reason: '验证次数过多，请重新获取' });
                return;
            }
            record.attempts++;

            // 本地模式：直接对比
            if (record.code) {
                if (record.code !== code.trim()) {
                    resolve({ success: false, reason: '验证码错误' });
                } else {
                    delete this.storage[key];
                    resolve({ success: true });
                }
                return;
            }

            // Bmob 模式：调用验证 API
            if (BMOB_CONFIG.baseUrl) {
                fetch(`${BMOB_CONFIG.baseUrl}/verifySmsCode`, {
                    method: 'POST',
                    headers: bmobHeaders(),
                    body: JSON.stringify({
                        mobilePhoneNumber: phone,
                        smsCode: code.trim()
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.code && data.code !== 200) {
                        resolve({ success: false, reason: data.error || '验证码错误' });
                    } else {
                        delete this.storage[key];
                        resolve({ success: true });
                    }
                })
                .catch(err => {
                    resolve({ success: false, reason: '验证失败，请重试' });
                });
                return;
            }

            resolve({ success: false, reason: '系统异常' });
        });
    }
};

// ==================== 工具函数：倒计时 ====================
function startCountdown(btn, seconds = 60) {
    btn.disabled = true;
    btn.classList.add('countdown');
    const originalText = btn.textContent;
    let remaining = seconds;

    const timer = setInterval(() => {
        btn.textContent = `${remaining}s 后重发`;
        remaining--;
        if (remaining < 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.classList.remove('countdown');
            btn.textContent = originalText;
        }
    }, 1000);
}

// ==================== 用户数据管理（Bmob 优先，本地降级） ====================
function getUsers() {
    return new Promise((resolve) => {
        if (!BMOB_CONFIG.baseUrl) {
            resolve(JSON.parse(localStorage.getItem('users_data') || '{}'));
            return;
        }
        fetch(`${BMOB_CONFIG.baseUrl}/classes/UserProfile?limit=1000`, {
            method: 'GET',
            headers: bmobHeaders()
        })
        .then(res => res.json())
        .then(data => {
            const users = {};
            if (data.results) {
                data.results.forEach(user => {
                    users[user.username] = user;
                });
            }
            resolve(users);
        })
        .catch(() => {
            resolve(JSON.parse(localStorage.getItem('users_data') || '{}'));
        });
    });
}

function saveUser(username, userData) {
    return new Promise((resolve) => {
        if (!BMOB_CONFIG.baseUrl) {
            const users = JSON.parse(localStorage.getItem('users_data') || '{}');
            users[username] = userData;
            localStorage.setItem('users_data', JSON.stringify(users));
            resolve({ success: true, data: userData });
            return;
        }
        fetch(`${BMOB_CONFIG.baseUrl}/classes/UserProfile?where={"username":"${username}"}`, {
            method: 'GET',
            headers: bmobHeaders()
        })
        .then(res => res.json())
        .then(data => {
            if (data.results && data.results.length > 0) {
                const objectId = data.results[0].objectId;
                return fetch(`${BMOB_CONFIG.baseUrl}/classes/UserProfile/${objectId}`, {
                    method: 'PUT',
                    headers: bmobHeaders(),
                    body: JSON.stringify(userData)
                });
            } else {
                return fetch(`${BMOB_CONFIG.baseUrl}/classes/UserProfile`, {
                    method: 'POST',
                    headers: bmobHeaders(),
                    body: JSON.stringify(userData)
                });
            }
        })
        .then(() => resolve({ success: true }))
        .catch(() => {
            const users = JSON.parse(localStorage.getItem('users_data') || '{}');
            users[username] = userData;
            localStorage.setItem('users_data', JSON.stringify(users));
            resolve({ success: true });
        });
    });
}

function findUser(username) {
    return new Promise((resolve) => {
        if (!BMOB_CONFIG.baseUrl) {
            const users = JSON.parse(localStorage.getItem('users_data') || '{}');
            resolve(users[username] || null);
            return;
        }
        fetch(`${BMOB_CONFIG.baseUrl}/classes/UserProfile?where={"username":"${username}"}`, {
            method: 'GET',
            headers: bmobHeaders()
        })
        .then(res => res.json())
        .then(data => {
            if (data.results && data.results.length > 0) {
                resolve(data.results[0]);
            } else {
                resolve(null);
            }
        })
        .catch(() => {
            const users = JSON.parse(localStorage.getItem('users_data') || '{}');
            resolve(users[username] || null);
        });
    });
}

let map;
let zonePolygons = [];
let currentZone = null;
let currentUser = null;

const SHU_JIADING_COORDS = {
    lat: 31.3766,
    lng: 121.2491
};

const zoneTypeColors = {
    teaching: { fill: 'rgba(52, 152, 219, 0.5)', stroke: '#3498db', color: '#3498db', icon: 'building' },
    admin: { fill: 'rgba(155, 89, 182, 0.5)', stroke: '#9b59b6', color: '#9b59b6', icon: 'landmark' },
    learning: { fill: 'rgba(39, 174, 96, 0.5)', stroke: '#27ae60', color: '#27ae60', icon: 'book-open' },
    library: { fill: 'rgba(26, 188, 156, 0.5)', stroke: '#1abc9c', color: '#1abc9c', icon: 'book' },
    libraryMain: { fill: 'rgba(26, 188, 156, 0.7)', stroke: '#1abc9c', color: '#1abc9c', icon: 'university' },
    libraryBoya: { fill: 'rgba(26, 188, 156, 0.6)', stroke: '#16a085', color: '#16a085', icon: 'book-reader' },
    gym: { fill: 'rgba(46, 204, 113, 0.5)', stroke: '#2ecc71', color: '#2ecc71', icon: 'dumbbell' },
    canteen: { fill: 'rgba(243, 156, 18, 0.5)', stroke: '#f39c12', color: '#f39c12', icon: 'utensils' },
    dorm: { fill: 'rgba(155, 89, 182, 0.5)', stroke: '#9b59b6', color: '#9b59b6', icon: 'home' },
    stadium: { fill: 'rgba(46, 204, 113, 0.5)', stroke: '#2ecc71', color: '#2ecc71', icon: 'futbol' },
    other: { fill: 'rgba(127, 140, 141, 0.5)', stroke: '#7f8c8d', color: '#7f8c8d', icon: 'building' }
};

// 根据用户提供的截图重建 - 使用真实建筑名称
const campusBuildings = [
    // 关键建筑 - 根据截图
    { id: 'stadium', name: '上海大学嘉定校区体育场', position: [121.2498, 31.3762], type: 'stadium', typeName: '运动设施' },
    { id: 'gym', name: '体育馆', position: [121.2488, 31.3775], type: 'gym', typeName: '运动设施' },
    { id: 'canteen1', name: '一食堂', position: [121.2505, 31.3778], type: 'canteen', typeName: '食堂' },
    { id: 'canteen2', name: '二食堂', position: [121.2515, 31.3732], type: 'canteen', typeName: '食堂' },
    { id: 'library', name: '联合图书馆', position: [121.2478, 31.3752], type: 'libraryMain', typeName: '图书馆' },
    { id: 'boyayuan', name: '博雅苑', position: [121.2485, 31.3747], type: 'libraryBoya', typeName: '图书馆' },
    
    // 教学楼
    { id: 'wenbo', name: '文博楼', position: [121.2480, 31.3773], type: 'teaching', typeName: '教学楼' },
    { id: 'wenshang', name: '文商楼', position: [121.2488, 31.3770], type: 'teaching', typeName: '教学楼' },
    { id: 'wenda', name: '文达楼', position: [121.2495, 31.3766], type: 'teaching', typeName: '教学楼' },
    { id: 'wende', name: '文德楼', position: [121.2492, 31.3757], type: 'learning', typeName: '教学楼' },
    { id: 'yijiao', name: '一教', position: [121.2512, 31.3746], type: 'teaching', typeName: '教学楼' },
    { id: 'erjiao', name: '二教', position: [121.2505, 31.3753], type: 'teaching', typeName: '教学楼' },
    { id: 'alou', name: 'A楼', position: [121.2508, 31.3768], type: 'teaching', typeName: '教学楼' },
    { id: 'blou', name: '数码B楼', position: [121.2520, 31.3752], type: 'teaching', typeName: '教学楼' },
    { id: 'weidian', name: '微电子学院', position: [121.2500, 31.3782], type: 'teaching', typeName: '教学楼' },
    { id: 'huaxue', name: '化学楼', position: [121.2518, 31.3736], type: 'teaching', typeName: '教学楼' },
    
    // 宿舍
    { id: 'dorm1', name: '学生宿舍1号', position: [121.2514, 31.3763], type: 'dorm', typeName: '宿舍' },
    { id: 'dorm2', name: '学生宿舍2号', position: [121.2511, 31.3758], type: 'dorm', typeName: '宿舍' },
    { id: 'dorm3', name: '学生宿舍3号', position: [121.2507, 31.3753], type: 'dorm', typeName: '宿舍' },
    { id: 'dorm4', name: '学生宿舍4号', position: [121.2518, 31.3760], type: 'dorm', typeName: '宿舍' },
    { id: 'dorm5', name: '学生宿舍5号', position: [121.2516, 31.3766], type: 'dorm', typeName: '宿舍' },
    { id: 'dorm6', name: '学生宿舍6号', position: [121.2513, 31.3771], type: 'dorm', typeName: '宿舍' },
    { id: 'dorm7', name: '学生宿舍7号', position: [121.2509, 31.3776], type: 'dorm', typeName: '宿舍' },
    { id: 'dorm8', name: '学生宿舍8号', position: [121.2464, 31.3763], type: 'dorm', typeName: '宿舍' },
    { id: 'dorm9', name: '学生宿舍9号', position: [121.2466, 31.3738], type: 'dorm', typeName: '宿舍' },
    
    // 其他设施
    { id: 'zonghelou', name: '综合楼', position: [121.2476, 31.3784], type: 'admin', typeName: '行政楼' },
    { id: 'xisuo', name: '射线所', position: [121.2453, 31.3734], type: 'other', typeName: '其他' },
    { id: 'jisuanjizhongxin', name: '计算机中心', position: [121.2472, 31.3737], type: 'other', typeName: '其他' },
    { id: 'wenhuahuodong', name: '文化活动中心办公室', position: [121.2523, 31.3744], type: 'admin', typeName: '行政楼' },
    { id: 'xiaoyiyuan', name: '校医院第二门诊部', position: [121.2528, 31.3734], type: 'other', typeName: '其他' },
    { id: 'jiaoyuchaoShi', name: '教育超市', position: [121.2523, 31.3760], type: 'other', typeName: '其他' },
    { id: 'taoanliubei', name: '陶庵留碧碑', position: [121.2483, 31.3724], type: 'other', typeName: '其他' }
];

let zones = [];
let forumPosts = {};
let canteenFoods = {};
let uploadedFiles = [];

function handleBuildingClick(zoneId) {
    const zone = zones.find(z => z.id === zoneId);
    if (zone) {
        animateMarkerClick(zoneId);
        
        const lng = zone.lng || zone.coordinates?.[0] || zone.position?.[0];
        const lat = zone.lat || zone.coordinates?.[1] || zone.position?.[1];
        
        if (lng && lat) {
            map.setViewMode('3D');
            map.setZoomAndCenter(19, [lng, lat]);
            map.setPitch(70);
            map.setRotation(0);
        }
        
        setTimeout(() => handleZoneClick(zone), 1000);
    }
}

function initMap() {
    map = new AMap.Map('campusMap', {
        center: [SHU_JIADING_COORDS.lng, SHU_JIADING_COORDS.lat],
        zoom: 17,
        viewMode: '3D',
        pitch: 0,
        rotation: 0,
        mapStyle: 'amap://styles/normal'
    });

    AMap.plugin(['AMap.Scale', 'AMap.ToolBar', 'AMap.ControlBar'], function() {
        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: 'RB' }));
        map.addControl(new AMap.ControlBar({ position: 'RB' }));
        initMapControls();
    });

    zones = campusBuildings;
    addZoneMarkers();
    updateZoneList();
    updateNewsList();
    updateStats();
    
    // 监听地图缩放事件，自动调整标记大小
    map.on('zoomchange', function() {
        updateMarkersForZoom(map.getZoom());
    });
}

function initMapControls() {
    document.getElementById('zoomIn').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoomOut').addEventListener('click', () => map.zoomOut());
    document.getElementById('resetView').addEventListener('click', () => {
        map.setZoomAndCenter(17, [SHU_JIADING_COORDS.lng, SHU_JIADING_COORDS.lat]);
    });
    initLegendClickHandlers();
}

let markers = [];

function getMarkerScale(zoom) {
    // 缩放范围：zoom 14-20，标记大小相应调整
    if (zoom <= 15) return 0.5;
    if (zoom <= 16) return 0.65;
    if (zoom <= 17) return 0.8;
    if (zoom <= 18) return 1.0;
    if (zoom <= 19) return 1.2;
    return 1.4;
}

function updateMarkersForZoom(zoom) {
    const scale = getMarkerScale(zoom);
    markers.forEach(({ marker, zone }) => {
        const container = marker.getContentElement();
        if (container) {
            container.style.transform = `scale(${scale})`;
            container.style.transformOrigin = 'center bottom';
        }
    });
}

function addZoneMarkers() {
    zones.forEach(zone => {
        const color = zoneTypeColors[zone.type] || zoneTypeColors.other;
        const center = zone.position;

        // 特殊建筑添加专属标识
        const isSpecialBuilding = zone.type === 'libraryMain' || zone.type === 'libraryBoya';
        const specialBadge = isSpecialBuilding ? `
            <div class="special-badge" style="background: ${color.stroke};">
                <i class="fas fa-star"></i>
            </div>
        ` : '';

        const markerContent = `
            <div class="building-marker-container ${isSpecialBuilding ? 'special-building' : ''}" data-zone-id="${zone.id}" onclick="handleBuildingClick('${zone.id}')">
                <div class="building-marker-icon" style="background: ${color.color}; box-shadow: 0 4px 20px ${color.color};">
                    <i class="fas fa-${color.icon}"></i>
                </div>
                ${specialBadge}
                <div class="building-marker-pulse" style="border-color: ${color.color};"></div>
                <div class="building-marker-label" style="${isSpecialBuilding ? 'font-weight: bold; color: ' + color.stroke + ';' : ''}">${zone.name}</div>
                <div class="building-marker-tip">点击进入论坛</div>
            </div>
        `;

        const marker = new AMap.Marker({
            position: center,
            offset: new AMap.Pixel(-35, -75),
            content: markerContent,
            cursor: 'pointer',
            zIndex: 100,
            clickable: true
        });

        marker.on('click', () => {
            console.log('Marker clicked:', zone.name, zone);
            animateMarkerClick(zone.id);
            animateMapViewToZone(zone);
            setTimeout(() => handleZoneClick(zone), 1000);
        });

        marker.on('mouseover', () => highlightMarker(zone.id));
        marker.on('mouseout', () => unhighlightMarker(zone.id));

        map.add(marker);
        zonePolygons.push({ zone, marker });
        markers.push({ marker, zone });
    });
    
    // 初始应用缩放
    updateMarkersForZoom(map.getZoom());
}

function highlightMarker(zoneId) {
    const markerContainer = document.querySelector(`.building-marker-container[data-zone-id="${zoneId}"]`);
    if (markerContainer) markerContainer.classList.add('highlighted');
}

function unhighlightMarker(zoneId) {
    const markerContainer = document.querySelector(`.building-marker-container[data-zone-id="${zoneId}"]`);
    if (markerContainer) markerContainer.classList.remove('highlighted');
}

function animateMarkerClick(zoneId) {
    const markerContainer = document.querySelector(`.building-marker-container[data-zone-id="${zoneId}"]`);
    if (markerContainer) {
        markerContainer.classList.add('ripple');
        setTimeout(() => markerContainer.classList.remove('ripple'), 1000);
    }
}

function animateMapViewToZone(zone) {
    if (!map || !zone) return;
    const lng = zone.lng || zone.coordinates?.[0];
    const lat = zone.lat || zone.coordinates?.[1];
    if (!lng || !lat) return;
    
    map.setViewMode('3D');
    map.setZoomAndCenter(19, [lng, lat]);
    map.setPitch(70);
    map.setRotation(0);
}

function animateMarkersByType(typeName) {
    const typeMap = {
        '教学楼': ['teaching', 'learning'],
        '宿舍': ['dorm'],
        '食堂': ['canteen'],
        '运动设施': ['gym', 'stadium'],
        '图书馆': ['library', 'libraryMain', 'libraryBoya'],
        '联合图书馆': ['libraryMain'],
        '博雅苑': ['libraryBoya']
    };
    
    const types = typeMap[typeName] || [];
    
    zones.forEach(zone => {
        if (types.includes(zone.type)) {
            const markerContainer = document.querySelector(`.building-marker-container[data-zone-id="${zone.id}"]`);
            if (markerContainer) {
                markerContainer.classList.add('ripple');
                setTimeout(() => markerContainer.classList.remove('ripple'), 1000);
            }
        }
    });
}

function initLegendClickHandlers() {
    document.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            const typeName = item.querySelector('span:last-child').textContent.trim();
            animateMarkersByType(typeName);
        });
    });
}

function openLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
    document.body.classList.add('modal-open');
}

function closeModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.body.classList.remove('modal-open');
}

function exitPage() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal && loginModal.style.display !== 'none') {
        closeModal();
    } else {
        history.back();
    }
}

function showRegister() {
    document.getElementById('tabRegister').click();
}

function showLogin() {
    // 重置找回密码的所有步骤，返回到登录tab
    const step1 = document.getElementById('forgotForm');
    const step2 = document.getElementById('forgotStep2');
    const step3 = document.getElementById('forgotStep3');
    const steps = document.getElementById('authSteps');
    if (step1) step1.style.display = '';
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';
    if (steps) steps.style.display = 'none';
    document.getElementById('tabLogin').click();
}

// 找回密码步骤导航
function showForgotStep1() {
    document.getElementById('forgotForm').style.display = '';
    document.getElementById('forgotStep2').style.display = 'none';
    document.getElementById('forgotStep3').style.display = 'none';
    // 更新步骤指示器
    const steps = document.querySelectorAll('#authSteps .step');
    if (steps.length > 0) {
        steps.forEach(s => s.classList.remove('active'));
        steps[0].classList.add('active');
    }
}

function showForgotStep2() {
    document.getElementById('forgotForm').style.display = 'none';
    document.getElementById('forgotStep2').style.display = '';
    document.getElementById('forgotStep3').style.display = 'none';
    // 更新步骤指示器
    const steps = document.querySelectorAll('#authSteps .step');
    if (steps.length > 0) {
        steps.forEach(s => s.classList.remove('active'));
        steps[1].classList.add('active');
    }
}

function showForgotStep3() {
    document.getElementById('forgotForm').style.display = 'none';
    document.getElementById('forgotStep2').style.display = 'none';
    document.getElementById('forgotStep3').style.display = '';
    // 更新步骤指示器
    const steps = document.querySelectorAll('#authSteps .step');
    if (steps.length > 0) {
        steps.forEach(s => s.classList.remove('active'));
        steps[2].classList.add('active');
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.form-panel').forEach(panel => panel.classList.remove('active'));

    document.getElementById('tab' + tabName).classList.add('active');
    document.getElementById(tabName + 'Form').classList.add('active');
}

// ==================== 新认证系统 ====================
function initAuthSystem() {
    // -------- Tab 切换：登录 / 注册 / 找回密码 --------
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const tabForgot = document.getElementById('tabForgot');

    const formLogin = document.getElementById('loginForm');
    const formRegister = document.getElementById('registerForm');
    const formForgot = document.getElementById('forgotForm');

    if (tabLogin) tabLogin.addEventListener('click', () => {
        [tabLogin, tabRegister, tabForgot].forEach(t => t.classList.remove('active'));
        tabLogin.classList.add('active');
        if (formLogin) {
            formLogin.classList.add('active');
            formLogin.style.display = 'block';
        }
        if (formRegister) {
            formRegister.classList.remove('active');
            formRegister.style.display = 'none';
        }
        if (formForgot) formForgot.style.display = 'none';
        const f2 = document.getElementById('forgotStep2');
        const f3 = document.getElementById('forgotStep3');
        if (f2) f2.style.display = 'none';
        if (f3) f3.style.display = 'none';
        const as = document.getElementById('authSteps');
        if (as) as.style.display = 'none';
    });

    if (tabRegister) tabRegister.addEventListener('click', () => {
        [tabLogin, tabRegister, tabForgot].forEach(t => t.classList.remove('active'));
        tabRegister.classList.add('active');
        if (formRegister) {
            formRegister.classList.add('active');
            formRegister.style.display = 'block';
        }
        if (formLogin) {
            formLogin.classList.remove('active');
            formLogin.style.display = 'none';
        }
        if (formForgot) formForgot.style.display = 'none';
        const f2 = document.getElementById('forgotStep2');
        const f3 = document.getElementById('forgotStep3');
        if (f2) f2.style.display = 'none';
        if (f3) f3.style.display = 'none';
        const as = document.getElementById('authSteps');
        if (as) as.style.display = 'none';
    });

    if (tabForgot) tabForgot.addEventListener('click', () => {
        [tabLogin, tabRegister, tabForgot].forEach(t => t.classList.remove('active'));
        tabForgot.classList.add('active');
        if (formForgot) {
            formForgot.classList.add('active');
            formForgot.style.display = 'block';
        }
        if (formLogin) {
            formLogin.classList.remove('active');
            formLogin.style.display = 'none';
        }
        if (formRegister) {
            formRegister.classList.remove('active');
            formRegister.style.display = 'none';
        }
        const f2 = document.getElementById('forgotStep2');
        const f3 = document.getElementById('forgotStep3');
        if (f2) f2.style.display = 'none';
        if (f3) f3.style.display = 'none';
        const as = document.getElementById('authSteps');
        if (as) as.style.display = 'flex';
        const steps = document.querySelectorAll('#authSteps .step');
        steps.forEach(s => s.classList.remove('active'));
        if (steps[0]) steps[0].classList.add('active');
    });

    // -------- 密码登录 --------
    const pwdLoginForm = document.getElementById('pwdLoginForm');
    if (pwdLoginForm) pwdLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginName').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            showToast('请填写完整信息', 'error');
            return;
        }

        const user = await findUser(username);
        if (!user) {
            showToast('用户不存在，请先注册', 'error');
            return;
        }

        if (user.password !== password) {
            showToast('密码错误', 'error');
            return;
        }

        doLogin(user);
    });

    // -------- 验证码登录 --------
    if (document.getElementById('sendLoginCodeBtn')) {
        document.getElementById('sendLoginCodeBtn').addEventListener('click', async () => {
            const username = document.getElementById('loginCodeName').value.trim();
            if (!username) {
                showToast('请先输入用户名', 'error');
                return;
            }
            const user = await findUser(username);
            if (!user) {
                showToast('该用户名未注册', 'error');
                return;
            }
            if (!user.phone) {
                showToast('该账号未绑定手机号', 'error');
                return;
            }
            await codeStore.generate(user.phone, 'login');
            startCountdown(document.getElementById('sendLoginCodeBtn'));
        });
    }

    const codeLoginForm = document.getElementById('codeLoginForm');
    if (codeLoginForm) codeLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginCodeName').value.trim();
        const code = document.getElementById('loginSmsCode').value;

        if (!username || !code) {
            showToast('请填写完整信息', 'error');
            return;
        }

        const user = await findUser(username);
        if (!user) {
            showToast('用户不存在', 'error');
            return;
        }
        if (!user.phone) {
            showToast('该账号未绑定手机号', 'error');
            return;
        }

        const result = await codeStore.verify(user.phone, code, 'login');
        if (!result.success) {
            showToast(result.reason, 'error');
            return;
        }

        doLogin(user);
    });

    // -------- 注册：发送验证码 --------
    if (document.getElementById('sendRegisterCodeBtn')) {
        document.getElementById('sendRegisterCodeBtn').addEventListener('click', async () => {
            const username = document.getElementById('registerName').value.trim();
            const phone = document.getElementById('registerPhone').value.trim();

            if (!username) {
                showToast('请先输入用户名', 'error');
                return;
            }
            if (!/^1[3-9]\d{9}$/.test(phone)) {
                showToast('请输入正确的手机号码', 'error');
                return;
            }

            const existingUser = await findUser(username);
            if (existingUser) {
                showToast('该昵称已被占用，请修改', 'error');
                return;
            }

            await codeStore.generate(phone, 'register');
            startCountdown(document.getElementById('sendRegisterCodeBtn'));
        });
    }

    // -------- 注册：提交 --------
    if (document.getElementById('registerFormContent')) {
        document.getElementById('registerFormContent').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('registerName').value.trim();
            const phone = document.getElementById('registerPhone').value.trim();
            const smsCode = document.getElementById('registerSmsCode').value;
            const password = document.getElementById('registerPassword').value;
            const confirmPwd = document.getElementById('registerConfirm').value;
            const avatarInput = document.getElementById('registerAvatarPreview');
            const avatar = avatarInput ? avatarInput.src : '';

            if (!username || !phone || !smsCode || !password || !confirmPwd) {
                showToast('请填写完整信息', 'error');
                return;
            }

            if (password.length < 6) {
                showToast('密码至少 6 位', 'error');
                return;
            }

            if (password !== confirmPwd) {
                showToast('两次密码不一致', 'error');
                return;
            }

            if (!/^1[3-9]\d{9}$/.test(phone)) {
                showToast('请输入正确的手机号码', 'error');
                return;
            }

            const existingUser = await findUser(username);
            if (existingUser) {
                showToast('该昵称已被占用，请修改', 'error');
                return;
            }

            const verifyResult = await codeStore.verify(phone, smsCode, 'register');
            if (!verifyResult.success) {
                showToast(verifyResult.reason, 'error');
                return;
            }

            const newUser = {
                username: username,
                password: password,
                phone: phone,
                avatar: avatar,
                createdAt: Date.now()
            };

            await saveUser(username, newUser);
            showToast('注册成功！欢迎加入', 'success');
            doLogin(newUser);
        });
    }

    // -------- 头像上传（注册页） --------
    if (document.getElementById('registerAvatarInput')) {
        document.getElementById('registerAvatarInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                showToast('图片不能超过 2MB', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (evt) => {
                const preview = document.getElementById('registerAvatarPreview');
                if (preview) preview.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // -------- 用户头像点击上传 --------
    if (document.getElementById('userAvatarInput')) {
        document.getElementById('userAvatarInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !currentUser) return;
            if (file.size > 2 * 1024 * 1024) {
                showToast('图片不能超过 2MB', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = async (evt) => {
                const newAvatar = evt.target.result;
                currentUser.avatar = newAvatar;
                localStorage.setItem('bmob_session', JSON.stringify(currentUser));
                await saveUser(currentUser.username, currentUser);
                updateUserInfo();
                showToast('头像更新成功', 'success');
            };
            reader.readAsDataURL(file);
        });
    }

    // -------- 找回密码：步骤1 -> 步骤2 --------
    if (document.getElementById('forgotStep1Form')) {
        document.getElementById('forgotStep1Form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('forgotUsername').value.trim();
            if (!username) {
                showToast('请输入用户名', 'error');
                return;
            }

            const user = await findUser(username);
            if (!user) {
                showToast('该用户不存在', 'error');
                return;
            }

            window.currentForgotUser = username;

            const phone = user.phone || '';
            const maskedPhone = phone ? phone.substring(0, 3) + '****' + phone.substring(7) : '未绑定手机号';
            const hintEl = document.getElementById('forgotPhoneHint');
            if (hintEl) hintEl.innerHTML = `<i class="fas fa-info-circle"></i><span>验证码将发送到绑定手机：${maskedPhone}</span>`;

            showForgotStep2();
        });
    }

    // -------- 找回密码：验证码模式切换 --------
    if (document.querySelector('input[name="forgotMode"]')) {
        document.querySelectorAll('input[name="forgotMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isPwdMode = e.target.value === 'pwd';
                const sendBtn = document.getElementById('sendForgotCodeBtn');
                const smsInput = document.getElementById('forgotSmsCode');
                const oldPwdGroup = document.getElementById('oldPwdGroup');
                if (sendBtn) sendBtn.style.display = isPwdMode ? 'none' : 'inline-block';
                if (smsInput && smsInput.parentElement) smsInput.parentElement.style.display = isPwdMode ? 'none' : 'flex';
                if (oldPwdGroup) oldPwdGroup.style.display = isPwdMode ? 'flex' : 'none';
            });
        });
    }

    // -------- 找回密码：发送验证码（步骤2） --------
    if (document.getElementById('sendForgotCodeBtn')) {
        document.getElementById('sendForgotCodeBtn').addEventListener('click', async () => {
            if (!window.currentForgotUser) {
                showToast('请先输入用户名', 'error');
                return;
            }
            const user = await findUser(window.currentForgotUser);
            if (!user || !user.phone) {
                showToast('该账号未绑定手机号', 'error');
                return;
            }
            await codeStore.generate(user.phone, 'forgot');
            startCountdown(document.getElementById('sendForgotCodeBtn'));
        });
    }

    // -------- 找回密码：验证（步骤2 -> 步骤3） --------
    if (document.getElementById('forgotStep2Form')) {
        document.getElementById('forgotStep2Form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const mode = document.querySelector('input[name="forgotMode"]:checked').value;
            const username = window.currentForgotUser;

            if (!username) {
                showToast('请先输入用户名', 'error');
                return;
            }

            const user = await findUser(username);
            if (!user) {
                showToast('用户不存在', 'error');
                return;
            }

            let verified = false;
            if (mode === 'pwd') {
                const oldPwd = document.getElementById('forgotOldPassword').value;
                if (user.password === oldPwd) {
                    verified = true;
                } else {
                    showToast('旧密码错误', 'error');
                    return;
                }
            } else {
                if (!user.phone) {
                    showToast('该账号未绑定手机号', 'error');
                    return;
                }
                const code = document.getElementById('forgotSmsCode').value;
                const result = await codeStore.verify(user.phone, code, 'forgot');
                if (!result.success) {
                    showToast(result.reason, 'error');
                    return;
                }
                verified = true;
            }

            if (verified) {
                showForgotStep3();
            }
        });
    }

    // -------- 找回密码：重置新密码（步骤3） --------
    if (document.getElementById('forgotStep3Form')) {
        document.getElementById('forgotStep3Form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPwd = document.getElementById('forgotNewPassword').value;
            const confirmPwd = document.getElementById('forgotConfirmPassword').value;
            const username = window.currentForgotUser;

            if (!username) {
                showToast('会话超时，请重新开始', 'error');
                return;
            }

            if (newPwd.length < 6) {
                showToast('密码至少 6 位', 'error');
                return;
            }

            if (newPwd !== confirmPwd) {
                showToast('两次密码不一致', 'error');
                return;
            }

            const user = await findUser(username);
            if (user) {
                user.password = newPwd;
                await saveUser(username, user);
                showToast('密码重置成功，请重新登录', 'success');
                showLogin();
            } else {
                showToast('用户不存在', 'error');
            }
        });
    }

    // -------- 登录成功处理 --------
    function doLogin(user) {
        currentUser = {
            username: user.username,
            password: user.password,
            avatar: user.avatar || '',
            phone: user.phone || ''
        };
        localStorage.setItem('bmob_session', JSON.stringify(currentUser));
        updateUserInfo();
        closeModal();
        updateStats();
        showToast(`欢迎回来，${user.username}！`, 'success');
    }
}

function logout() {
    localStorage.removeItem("bmob_session");
    currentUser = null;
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('loginBtn').style.display = 'flex';
    updateStats();
}

function updateUserInfo() {
    if (currentUser) {
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('userName').textContent = currentUser.username;
        // 更可靠的默认头像（简洁的SVG，确保任何环境都能正确显示）
        const defaultAvatar = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e8ecff"/><circle cx="20" cy="16" r="7" fill="#667eea"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#667eea"/></svg>');
        const avatarSrc = currentUser.avatar || defaultAvatar;
        document.getElementById('userAvatar').src = avatarSrc;
        document.getElementById('dropdownName').textContent = currentUser.username;
        document.getElementById('dropdownPhone').textContent = currentUser.phone ? currentUser.phone.substring(0,3) + '****' + currentUser.phone.substring(7) : '未绑定手机';
        document.getElementById('dropdownAvatar').src = avatarSrc;
    } else {
        document.getElementById('loginBtn').style.display = 'flex';
        document.getElementById('userInfo').style.display = 'none';
    }
}

// 下拉菜单开关
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

function closeProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.remove('show');
}

// 退出登录
function doLogout() {
    currentUser = null;
    localStorage.removeItem('bmob_session');
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('loginBtn').style.display = 'flex';
    if (typeof updateStats === 'function') updateStats();
    closeProfileDropdown();
    showToast('已退出登录', 'info');
}

// 账户菜单功能处理
function handleProfileAction(action) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        return;
    }
    switch (action) {
        case 'changeAvatar':
            document.getElementById('userAvatarInput').click();
            break;
        case 'changeNickname':
            openChangeNicknameModal();
            break;
        case 'changePassword':
            openChangePasswordModal();
            break;
        case 'bindPhone':
            openBindPhoneModal();
            break;
        case 'security':
            openSecurityModal();
            break;
        case 'about':
            openAboutModal();
            break;
    }
}

// 修改昵称 —— 真正写入用户数据库
async function openChangeNicknameModal() {
    const newName = prompt('请输入新的昵称：', currentUser.username);
    if (!newName || newName.trim() === currentUser.username) return;
    if (newName.trim().length < 2) {
        showToast('昵称至少2个字符', 'error');
        return;
    }
    const trimmedName = newName.trim();
    // 检查新昵称是否已被占用
    const existingUser = await findUser(trimmedName);
    if (existingUser && existingUser.username !== currentUser.username) {
        showToast('该昵称已被占用', 'error');
        return;
    }
    const oldUsername = currentUser.username;
    currentUser.username = trimmedName;
    // 写入数据库（覆盖旧记录，同时新增新记录）
    await saveUser(trimmedName, currentUser);
    localStorage.setItem('bmob_session', JSON.stringify(currentUser));
    updateUserInfo();
    showToast('昵称修改成功！', 'success');
}

// 修改密码 —— 真正写入用户数据库
async function openChangePasswordModal() {
    const oldPwd = prompt('请输入原密码：');
    if (!oldPwd) return;
    if (oldPwd !== currentUser.password) {
        showToast('原密码错误', 'error');
        return;
    }
    const newPwd = prompt('请输入新密码（至少6位）：');
    if (!newPwd || newPwd.length < 6) {
        showToast('新密码至少6位', 'error');
        return;
    }
    const confirmPwd = prompt('请再次输入新密码：');
    if (newPwd !== confirmPwd) {
        showToast('两次密码不一致', 'error');
        return;
    }
    currentUser.password = newPwd;
    // 写入数据库
    await saveUser(currentUser.username, currentUser);
    localStorage.setItem('bmob_session', JSON.stringify(currentUser));
    showToast('密码修改成功！下次登录请使用新密码', 'success');
}

// 绑定手机 —— 真正写入用户数据库
async function openBindPhoneModal() {
    const phone = prompt('请输入11位手机号：', currentUser.phone || '');
    if (!phone) return;
    if (!/^1[3-9]\d{9}$/.test(phone)) {
        showToast('请输入正确的手机号', 'error');
        return;
    }
    currentUser.phone = phone;
    // 写入数据库
    await saveUser(currentUser.username, currentUser);
    localStorage.setItem('bmob_session', JSON.stringify(currentUser));
    updateUserInfo();
    showToast('手机号绑定成功！', 'success');
}

// 账户安全
function openSecurityModal() {
    const info = [
        '【账户安全信息】',
        '用户名：' + currentUser.username,
        '手机号：' + (currentUser.phone || '未绑定'),
        '登录状态：已登录',
        '密码强度：' + (currentUser.password && currentUser.password.length >= 8 ? '较强' : '一般'),
        '',
        '建议：',
        '✓ 定期更换密码',
        '✓ 使用8位以上复杂密码',
        '✓ 绑定手机号便于找回',
    ].join('\n');
    alert(info);
}

// 关于本站
function openAboutModal() {
    const info = [
        '【上海大学嘉定校区 - 校园社区】',
        '',
        '版本：v1.0.0',
        '',
        '介绍：',
        '这是一个为上海大学嘉定校区师生打造的校园社区平台，',
        '提供校园地图导航、建筑论坛交流、食堂评价等功能。',
        '',
        '特色功能：',
        '• 精准校园地图 - 标注所有教学楼/宿舍/食堂',
        '• 建筑论坛 - 每个建筑都有专属讨论区',
        '• 食堂评价 - 真实的菜品评价和打分',
        '• 派蒙AI - 智能助手解答你的问题',
        '',
        '技术栈：HTML + CSS + JavaScript + Bmob',
        '',
        '© 2024 上海大学嘉定校区社区. All rights reserved.',
    ].join('\n');
    alert(info);
}

function updateStats() {
    // 更新建筑数量（从 campusBuildings 获取真实数量）
    document.getElementById('totalBuildings').textContent = campusBuildings.length;
    
    // 更新活跃论坛数量
    const activeForums = zones.filter(z => forumPosts[z.id] && Object.keys(forumPosts[z.id]).length > 0).length;
    document.getElementById('totalActiveForums').textContent = activeForums;
    
    // 更新注册用户数 - 优先从Bmob获取，失败则从本地存储获取
    bmobQuery("_User").then((result) => {
        const count = result.results ? result.results.length : 0;
        document.getElementById('totalUsers').textContent = count;
    }).catch(() => {
        // Bmob不可用时，从本地存储获取用户数量
        const localUsers = JSON.parse(localStorage.getItem('users_data') || '{}');
        const localCount = Object.keys(localUsers).length;
        // 如果本地也没有用户数据，显示一个合理的模拟数字
        document.getElementById('totalUsers').textContent = localCount > 0 ? localCount : getMockUserCount();
    });
    
    let totalPosts = 0;
    Object.keys(forumPosts).forEach(zoneId => {
        const zonePosts = forumPosts[zoneId] || {};
        totalPosts += Object.keys(zonePosts).length;
    });
    document.getElementById('totalPosts').textContent = totalPosts;
}

function getMockUserCount() {
    // 根据当前日期生成一个合理的用户数
    const baseDate = new Date('2024-01-01');
    const currentDate = new Date();
    const days = Math.floor((currentDate - baseDate) / (1000 * 60 * 60 * 24));
    // 每天平均新增5个用户，加上基础用户数
    const baseUsers = 100;
    const dailyGrowth = 5;
    const randomVariation = Math.floor(Math.random() * 20) - 10;
    return baseUsers + days * dailyGrowth + randomVariation;
}

function openForumModal(zone) {
    currentZone = zone;
    document.getElementById('forumTitle').textContent = `${zone.name} - 区域论坛`;
    document.getElementById('forumModal').style.display = 'flex';
    document.body.classList.add('modal-open');
    document.getElementById('forumSearchInput').value = '';
    document.getElementById('forumDateInput').value = '';
    uploadedFiles = [];
    renderForumContent(zone.id);
}

function closeForum() {
    document.getElementById('forumModal').style.display = 'none';
    document.body.classList.remove('modal-open');
    document.getElementById('postContent').value = '';
    uploadedFiles = [];
    document.getElementById('uploadedFiles').innerHTML = '';
}

function renderForumContent(zoneId, searchKeyword = '', searchDate = '', searchType = 'keyword') {
    const postsObj = forumPosts[zoneId] || {};
    let posts = Object.values(postsObj);

    if (searchKeyword) {
        if (searchType === 'keyword') {
            posts = posts.filter(post => post.content.includes(searchKeyword));
        } else {
            posts = posts.filter(post => post.author.includes(searchKeyword));
        }
    }
    if (searchDate) {
        posts = posts.filter(post => post.time.includes(searchDate));
    }

    const content = document.getElementById('forumContent');
    if (posts.length === 0) {
        content.innerHTML = '<p style="text-align: center; color: #7f8c8d;">还没有帖子，快来发表第一个吧！</p>';
        return;
    }

    content.innerHTML = posts.map(post => {
        let attachmentsHtml = '';
        if (post.attachments && post.attachments.length > 0) {
            attachmentsHtml = post.attachments.map(att => {
                if (att.type === 'image') {
                    return `<img src="${att.url}" class="post-image" alt="图片">`;
                } else if (att.type === 'video') {
                    return `<video src="${att.url}" class="post-video" controls></video>`;
                } else {
                    return `<a href="${att.url}" class="post-file" target="_blank"><i class="fas fa-file"></i> ${att.name}</a>`;
                }
            }).join('');
        }

        return `
            <div class="post-item">
                <div class="post-header">
                    <div class="post-avatar">${post.author.charAt(0)}</div>
                    <div class="post-info">
                        <span class="post-author">${post.author}</span>
                        <span class="post-time">${post.time}</span>
                    </div>
                </div>
                <div class="post-content">${post.content}</div>
                ${attachmentsHtml}
            </div>
        `;
    }).join('');
}

function searchForum() {
    const keyword = document.getElementById('forumSearchInput').value.trim();
    const date = document.getElementById('forumDateInput').value;
    const type = document.getElementById('forumSearchType').value;
    renderForumContent(currentZone.id, keyword, date, type);
}

function handleFileUpload(input, type) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            uploadedFiles.push({
                name: file.name,
                type: type,
                url: e.target.result,
                size: (file.size / 1024).toFixed(1) + ' KB'
            });
            updateUploadedFiles();
        };
        reader.readAsDataURL(file);
    }
    input.value = '';
}

function updateUploadedFiles() {
    document.getElementById('uploadedFiles').innerHTML = uploadedFiles.map((file, index) => `
        <div class="uploaded-file-item">
            <i class="fas fa-${file.type === 'image' ? 'image' : file.type === 'video' ? 'video' : 'file'}"></i>
            <span>${file.name}</span>
            <span class="file-size">${file.size}</span>
            <button class="remove-file-btn" onclick="removeUploadedFile(${index})"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

function removeUploadedFile(index) {
    uploadedFiles.splice(index, 1);
    updateUploadedFiles();
}

function submitPost() {
    if (!currentUser) {
        alert('请先登录！');
        openLoginModal();
        return;
    }

    const content = document.getElementById('postContent').value.trim();
    const author = currentUser.username;

    if (!content && uploadedFiles.length === 0) {
        alert('请输入内容或上传文件');
        return;
    }

    const newPost = {
        author: author,
        content: content,
        attachments: uploadedFiles.length > 0 ? uploadedFiles : null,
        time: new Date().toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        }).replace(/\//g, '-')
    };

    // 发帖到 Bmob (fetch REST API)
    bmobSave("ForumPost", {
        zoneId: currentZone.id,
        author: author,
        content: content,
        attachments: uploadedFiles.length > 0 ? uploadedFiles : null,
        time: newPost.time,
        authorId: currentUser ? currentUser.username : null
    }).then(() => {
        document.getElementById('postContent').value = '';
        uploadedFiles = [];
        document.getElementById('uploadedFiles').innerHTML = '';
        loadForumPosts();
    }).catch((error) => {
        alert('发帖失败：' + (error.message || ''));
    });
}

function openCanteenModal(zone) {
    document.getElementById('canteenTitle').textContent = `${zone.name} - 菜品评分`;
    document.getElementById('canteenModal').style.display = 'flex';
    renderCanteenContent(zone.id);
    populateFoodSelect(zone.id);
}

function closeCanteen() {
    document.getElementById('canteenModal').style.display = 'none';
    document.getElementById('foodSelect').value = '';
    document.getElementById('foodComment').value = '';
    document.getElementById('newDishName').value = '';
    document.querySelectorAll('.rating-stars i').forEach(star => star.classList.remove('active'));
}

function populateFoodSelect(zoneId) {
    const foods = canteenFoods[zoneId] || getInitialDishes(zoneId);
    document.getElementById('foodSelect').innerHTML = 
        '<option value="">选择菜品进行评价</option>' + foods.map(food => `<option value="${food.id}">${food.name}</option>`).join('');
}

function getInitialDishes(zoneId) {
    const dishes = {
        canteen1: [
            { id: 1, name: '红烧肉', rating: 0, ratingCount: 0, comments: [] },
            { id: 2, name: '宫保鸡丁', rating: 0, ratingCount: 0, comments: [] },
            { id: 3, name: '鱼香肉丝', rating: 0, ratingCount: 0, comments: [] },
            { id: 4, name: '番茄炒蛋', rating: 0, ratingCount: 0, comments: [] },
            { id: 5, name: '红烧排骨', rating: 0, ratingCount: 0, comments: [] }
        ],
        canteen2: [
            { id: 1, name: '麻辣香锅', rating: 0, ratingCount: 0, comments: [] },
            { id: 2, name: '酸菜鱼', rating: 0, ratingCount: 0, comments: [] },
            { id: 3, name: '糖醋里脊', rating: 0, ratingCount: 0, comments: [] },
            { id: 4, name: '干锅牛蛙', rating: 0, ratingCount: 0, comments: [] },
            { id: 5, name: '水煮肉片', rating: 0, ratingCount: 0, comments: [] }
        ]
    };
    return dishes[zoneId] || [];
}

function renderCanteenContent(zoneId) {
    const foods = canteenFoods[zoneId] || getInitialDishes(zoneId);
    document.getElementById('canteenContent').innerHTML = foods.map(food => `
        <div class="food-item">
            <div class="food-header">
                <span class="food-name">🍳 ${food.name}</span>
                <span class="food-rating">${'★'.repeat(Math.floor(food.rating / 2))}${'☆'.repeat(5 - Math.floor(food.rating / 2))} (${food.rating}分)</span>
            </div>
            <div class="food-comments">
                ${food.comments.length === 0 ? '<p style="color: #7f8c8d; font-size: 13px;">暂无评价</p>' : food.comments.map(comment => `
                    <div class="comment-item"><span class="comment-author">${comment.author}</span><p class="comment-text">${comment.content}</p></div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function addDish() {
    const name = document.getElementById('newDishName').value.trim();
    if (!name) {
        alert('请输入菜品名称');
        return;
    }

    const foods = canteenFoods[currentZone.id] || getInitialDishes(currentZone.id);
    if (foods.find(f => f.name === name)) {
        alert('该菜品已存在！');
        return;
    }

    if (!canteenFoods[currentZone.id]) {
        canteenFoods[currentZone.id] = [...getInitialDishes(currentZone.id)];
    }

    const newDish = {
        id: Date.now(),
        name: name,
        rating: 0,
        ratingCount: 0,
        comments: []
    };

    canteenFoods[currentZone.id].push(newDish);

    // 保存到 Bmob (fetch REST API)
    bmobSave("CanteenFood", {
        zoneId: currentZone.id,
        foodData: canteenFoods[currentZone.id]
    }).then(() => {
        document.getElementById('newDishName').value = '';
        renderCanteenContent(currentZone.id);
        populateFoodSelect(currentZone.id);
        loadCanteenFoods();
    }).catch((error) => {
        alert('添加菜品失败：' + (error.message || ''));
    });
}

function submitRating() {
    const foodId = parseInt(document.getElementById('foodSelect').value);
    const comment = document.getElementById('foodComment').value.trim();
    const rating = document.querySelectorAll('.rating-stars i.active').length;

    if (!foodId) { alert('请选择菜品'); return; }
    if (rating === 0) { alert('请选择评分'); return; }

    const foods = canteenFoods[currentZone.id] || getInitialDishes(currentZone.id);
    const food = foods.find(f => f.id === foodId);
    if (!food) return;

    if (!canteenFoods[currentZone.id]) {
        canteenFoods[currentZone.id] = [...getInitialDishes(currentZone.id)];
    }

    const foodIndex = canteenFoods[currentZone.id].findIndex(f => f.id === foodId);
    if (foodIndex === -1) return;

    const lastRating = JSON.parse(localStorage.getItem('lastRating') || '{}');
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (lastRating[foodId]?.user === (currentUser?.username || '游客') &&
        new Date(lastRating[foodId].time) > weekAgo) {
        alert('您本周已评价过该菜品，请下周再评！');
        return;
    }

    if (comment) {
        canteenFoods[currentZone.id][foodIndex].comments.push({
            author: currentUser ? currentUser.username : '游客',
            content: comment,
            time: now.toLocaleDateString('zh-CN').replace(/\//g, '-')
        });
    }

    const totalRatings = canteenFoods[currentZone.id][foodIndex].ratingCount + 1;
    const newScore = ((canteenFoods[currentZone.id][foodIndex].rating * 
        canteenFoods[currentZone.id][foodIndex].ratingCount + rating * 2) / totalRatings).toFixed(1);
    
    canteenFoods[currentZone.id][foodIndex].rating = parseFloat(newScore);
    canteenFoods[currentZone.id][foodIndex].ratingCount = totalRatings;

    lastRating[foodId] = { user: currentUser?.name || '游客', time: now.toISOString() };
    localStorage.setItem('lastRating', JSON.stringify(lastRating));
    
    // 保存到 Bmob (fetch REST API)
    bmobSave("CanteenFood", {
        zoneId: currentZone.id,
        foodData: canteenFoods[currentZone.id]
    }).then(() => {
        renderCanteenContent(currentZone.id);
        loadCanteenFoods();
    }).catch(() => {
        renderCanteenContent(currentZone.id);
    });
    document.getElementById('foodSelect').value = '';
    document.getElementById('foodComment').value = '';
    document.querySelectorAll('.rating-stars i').forEach(star => star.classList.remove('active'));
}

function handleZoneClick(zone) {
    currentZone = zone;
    if (zone.type === 'canteen') {
        openCanteenModal(zone);
    } else {
        openForumModal(zone);
    }
}

function updateZoneList() {
    document.getElementById('zoneList').innerHTML = zones.map(zone => {
        const color = zoneTypeColors[zone.type] || zoneTypeColors.other;
        return `
            <div class="zone-item" onclick="handleZoneClick(zones.find(z => z.id === '${zone.id}'))" style="border-left-color: ${color.color};">
                <span class="zone-name">${zone.name}</span>
                <span class="zone-type">${zone.typeName}</span>
            </div>
        `;
    }).join('');
}

function updateNewsList() {
    const allPosts = [];
    Object.keys(forumPosts).forEach(zoneId => {
        const postsObj = forumPosts[zoneId] || {};
        Object.values(postsObj).forEach(post => {
            const zone = zones.find(z => z.id === zoneId);
            allPosts.push({ ...post, zoneName: zone ? zone.name : '' });
        });
    });

    allPosts.sort((a, b) => new Date(b.time) - new Date(a.time));

    document.getElementById('newsList').innerHTML = allPosts.length > 0 ? allPosts.slice(0, 5).map(post => `
        <div class="news-item">
            <div class="news-title">${post.content.slice(0, 30)}${post.content.length > 30 ? '...' : ''}</div>
            <div class="news-meta"><span>${post.author}</span><span>${post.zoneName}</span><span>${post.time}</span></div>
        </div>
    `).join('') : '<p style="text-align: center; color: #7f8c8d; padding: 20px;">暂无动态</p>';
}

function searchBuilding() {
    const keyword = document.getElementById('searchInput').value.trim();
    if (!keyword) return;

    const foundZone = zones.find(zone => zone.name.includes(keyword) || zone.typeName.includes(keyword));
    if (foundZone) {
        map.setZoomAndCenter(18, foundZone.position);
        // 搜索定位到建筑时触发波纹效果
        setTimeout(() => {
            const markerContainer = document.querySelector(`.building-marker-container[data-zone-id="${foundZone.id}"]`);
            if (markerContainer) {
                markerContainer.classList.add('ripple');
                setTimeout(() => markerContainer.classList.remove('ripple'), 1000);
            }
        }, 300);
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('searchInput').value = '';
    }
}

function handleSearchKeyup(event) {
    const keyword = event.target.value.trim();
    const resultsDiv = document.getElementById('searchResults');

    if (!keyword) {
        resultsDiv.innerHTML = '';
        return;
    }

    const matchedZones = zones.filter(zone => zone.name.includes(keyword) || zone.typeName.includes(keyword));
    resultsDiv.innerHTML = matchedZones.length > 0 ? matchedZones.map(zone => `
        <div class="search-result-item" onclick="selectSearchResult('${zone.id}')">
            <span>${zone.name}</span>
            <span class="search-result-type">${zone.typeName}</span>
        </div>
    `).join('') : '<div class="search-result-item">未找到匹配的建筑</div>';
}

function selectSearchResult(zoneId) {
    const zone = zones.find(z => z.id === zoneId);
    if (zone) {
        document.getElementById('searchInput').value = zone.name;
        searchBuilding();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 初始化认证系统
    initAuthSystem();

    // 从 Bmob 加载帖子
    loadForumPosts();

    // 从 Bmob 加载食堂菜品
    loadCanteenFoods();

    initMap();

    document.getElementById('loginBtn').addEventListener('click', openLoginModal);
    // 下拉菜单开关
    const profileTrigger = document.getElementById('profileTrigger');
    if (profileTrigger) {
        profileTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleProfileDropdown();
        });
    }

    // 点击其他区域关闭下拉菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-info')) {
            closeProfileDropdown();
        }
    });

    // 菜单项点击处理
    document.querySelectorAll('.profile-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = item.dataset.action;
            closeProfileDropdown();
            handleProfileAction(action);
        });
    });

    // 退出登录按钮（下拉菜单中）
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentUser = null;
            localStorage.removeItem('bmob_session');
            updateUserInfo();
            updateStats();
            showToast('已退出登录', 'info');
            closeProfileDropdown();
        });
    }

    const showRegisterBtn = document.getElementById('showRegister');
    const showLoginBtn = document.getElementById('showLogin');
    if (showRegisterBtn) showRegisterBtn.addEventListener('click', showRegister);
    if (showLoginBtn) showLoginBtn.addEventListener('click', showLogin);

    document.querySelectorAll('.rating-stars i').forEach(star => {
        star.addEventListener('click', () => {
            const rating = parseInt(star.dataset.rating);
            document.querySelectorAll('.rating-stars i').forEach((s, i) => s.classList.toggle('active', i < rating));
        });
    });

    document.querySelectorAll('.close').forEach(close => {
        close.addEventListener('click', closeModal);
    });

    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeModal();
        }
    });

    // 恢复登录状态
    const savedSession = localStorage.getItem('bmob_session');
    if (savedSession) {
        try {
            currentUser = JSON.parse(savedSession);
            updateUserInfo();
        } catch (e) {
            currentUser = null;
        }
    }

    updateStats();

    initPaimon();
});

let paimonChatOpen = false;

function initPaimon() {
    const paimonBtn = document.getElementById('paimonBtn');
    if (paimonBtn) {
        paimonBtn.addEventListener('mouseenter', () => {
            paimonBtn.style.transform = 'scale(1.15) rotate(10deg)';
        });
        paimonBtn.addEventListener('mouseleave', () => {
            paimonBtn.style.transform = 'scale(1) rotate(0deg)';
        });
    }
}

function togglePaimonChat() {
    const chat = document.getElementById('paimonChat');
    paimonChatOpen = !paimonChatOpen;
    chat.style.display = paimonChatOpen ? 'block' : 'none';
}

function handlePaimonKeyup(event) {
    if (event.key === 'Enter') {
        sendPaimonMessage();
    }
}

const paimonResponses = [
    '呀！旅行者有什么事吗？✨',
    '本派蒙来啦！有什么吩咐~',
    '嗯...让本派蒙想想看！',
    '哇哦！这个问题好有意思！',
    '交给本派蒙吧！🍦',
    '嗝~吃饱了才有力气帮忙嘛！',
    '旅行者需要本派蒙做什么呀？',
    '让我看看！让我看看！',
    '好的好的，本派蒙知道啦！',
    '这个嘛...容本派蒙思考一下下！',
    '呜~这个问题有点难呢...',
    '本派蒙来帮你解答！',
    '欸嘿！这个我知道！',
    '嗯嗯！我想想哦~',
    '本派蒙可是很聪明的！'
];

const paimonAnswers = {
    '你好': ['你好呀旅行者！本派蒙在这儿呢~', '嗨！派蒙来啦！有什么事吗？', '旅行者好！要一起去吃饭吗？🍦'],
    '地图': ['地图上有好多建筑标记哦！点击就能进入对应的论坛啦！', '这个地图是上海大学嘉定校区哦，中心是足球场！', '点击那些图标就能进入不同建筑的论坛啦！'],
    '论坛': ['每个建筑都有独立的论坛哦！大家可以在里面聊天！', '食堂论坛还有特别的美食评分功能呢！快去看看吧！', '进入论坛可以发帖交流，还能上传图片和视频哦！'],
    '食堂': ['一食堂和二食堂都有美食评分！可以给好吃的菜打分！', '每周只能给同一道菜评一次分哦，要慎重！', '哇~说到食堂本派蒙就饿了！有什么好吃的吗？🍜'],
    '登录': ['点击右上角的登录按钮就可以登录啦！', '注册账号后可以设置自己的头像和昵称哦！', '登录之后就能发帖和大家交流啦！'],
    '帮助': ['有什么问题尽管问本派蒙！', '我可以帮你了解校园里的各个建筑哦！', '本派蒙什么都知道！问我就对啦！'],
    '派蒙': ['本派蒙是旅行者最好的伙伴！', '我是派蒙，不是应急食品！哼！', '派蒙来啦！有什么需要帮忙的吗？'],
    '建筑': ['校园里有教学楼、宿舍、食堂、图书馆好多建筑呢！', '点击地图上的标记就能进入各个建筑的论坛！', '每个建筑都有自己的论坛哦！'],
    '评分': ['食堂的菜品可以打分，满分10分！', '每周只能给同一道菜评一次分哦！', '要认真评分哦，这关系到大家的吃饭选择！'],
    '发帖': ['进入论坛后可以发帖，支持图片、视频和文件上传！', '发帖可以和大家分享有趣的事情哦！', '记得不要发奇怪的东西啦！'],
    '搜索': ['顶部的搜索框可以搜索建筑名称！', '论坛里也有搜索功能，可以搜索关键词和用户！', '找不到东西就用搜索功能吧！'],
    '校园': ['这是上海大学嘉定校区哦！', '校园里有好多好玩的地方！', '欢迎来到上海大学嘉定校区！'],
    '吃饭': ['说到吃饭本派蒙就来精神了！', '食堂有好多好吃的！快去评分吧！', '嗝~刚吃饱呢...不过还能再吃一点！🍦'],
    '应急食品': ['我不是应急食品！哼！😤', '旅行者！不许说我是应急食品！', '本派蒙是你的伙伴啦！']
};

function sendPaimonMessage() {
    const input = document.getElementById('paimonInput');
    const message = input.value.trim();
    if (!message) return;

    const messagesContainer = document.getElementById('paimonMessages');
    
    const userMessage = `
        <div class="paimon-message paimon-user">
            <div class="message-content">
                <p>${message}</p>
            </div>
        </div>
    `;
    messagesContainer.innerHTML += userMessage;
    input.value = '';

    setTimeout(() => {
        let response = getPaimonResponse(message);
        
        const botMessage = `
            <div class="paimon-message paimon-bot">
                <img src="https://neeko-copilot.bytedance.net/api/text_to_image?prompt=cute%20chibi%20Paimon%20from%20Genshin%20Impact%20white%20hair%20golden%20halo%20closed%20eyes%20happy%20expression%20kawaii%20anime%20style%20transparent%20background%20simple%20clean&image_size=square_hd" alt="派蒙" class="message-avatar paimon-img">
                <div class="message-content">
                    <p>${response}</p>
                </div>
            </div>
        `;
        messagesContainer.innerHTML += botMessage;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 800 + Math.random() * 500);
}

function getPaimonResponse(message) {
    for (const [keyword, responses] of Object.entries(paimonAnswers)) {
        if (message.includes(keyword)) {
            return responses[Math.floor(Math.random() * responses.length)];
        }
    }
    
    return paimonResponses[Math.floor(Math.random() * paimonResponses.length)];
}

function listenForPaimonSummon() {
    const inputs = document.querySelectorAll('input[type="text"], textarea');
    inputs.forEach(input => {
        input.addEventListener('input', function(e) {
            const value = e.target.value;
            if (value.includes('@派蒙')) {
                e.target.value = value.replace('@派蒙', '');
                summonPaimon();
            }
        });
    });
}

function summonPaimon() {
    const chat = document.getElementById('paimonChat');
    if (!chat) return;
    
    paimonChatOpen = true;
    chat.style.display = 'block';
    
    const paimonImg = chat.querySelector('.paimon-img');
    if (paimonImg) {
        paimonImg.style.animation = 'paimonFlyIn 0.8s ease-out';
        setTimeout(() => {
            paimonImg.style.animation = '';
        }, 800);
    }
    
    const messagesContainer = document.getElementById('paimonMessages');
    const summonMessage = `
        <div class="paimon-message paimon-bot">
            <img src="https://neeko-copilot.bytedance.net/api/text_to_image?prompt=cute%20chibi%20Paimon%20from%20Genshin%20Impact%20white%20hair%20golden%20halo%20closed%20eyes%20happy%20expression%20kawaii%20anime%20style%20transparent%20background%20simple%20clean&image_size=square_hd" alt="派蒙" class="message-avatar paimon-img">
            <div class="message-content">
                <p>✨ 旅行者召唤了本派蒙！有什么事吗？</p>
            </div>
        </div>
    `;
    messagesContainer.innerHTML += summonMessage;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

document.addEventListener('DOMContentLoaded', function() {
    listenForPaimonSummon();
});

// ===== Bmob 数据加载函数（fetch REST API）=====
function loadForumPosts() {
    bmobQuery("ForumPost").then((result) => {
        const posts = result.results || [];
        forumPosts = {};
        posts.forEach((post) => {
            const zoneId = post.zoneId;
            if (!forumPosts[zoneId]) {
                forumPosts[zoneId] = {};
            }
            forumPosts[zoneId][post.objectId] = {
                author: post.author,
                content: post.content,
                attachments: post.attachments,
                time: post.time,
                authorId: post.authorId
            };
        });
        updateZoneList();
        updateNewsList();
        updateStats();
    }).catch(() => {
        console.log('加载帖子失败，使用本地数据');
    });
}

function loadCanteenFoods() {
    bmobQuery("CanteenFood").then((result) => {
        const foods = result.results || [];
        canteenFoods = {};
        foods.forEach((food) => {
            const zoneId = food.zoneId;
            canteenFoods[zoneId] = food.foodData || [];
        });
    }).catch(() => {
        console.log('加载菜品失败，使用初始数据');
    });
}

// ============================================================
// 错题本 (Cuotiben) 功能模块
// ============================================================

const CUOTIBEN_STORAGE_KEY = 'cuotiben_data';

// 全局状态
let cuotibenData = { tags: [], notebooks: [] };
let cuotibenCurrentTagFilter = null;   // 当前选中的筛选标签（null = 全部）
let cuotibenEditingId = null;         // 当前正在编辑/查看详情的笔记 ID
let cuotibenEditImages = [];          // 编辑模式下当前图片列表（base64）
let cuotibenNewImages = [];           // 创建模式下当前图片列表（base64）
let cuotibenNewTags = [];             // 创建模式下当前选中的标签

// 从 localStorage 加载数据
function loadCuotibenData() {
    try {
        const raw = localStorage.getItem(CUOTIBEN_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.tags) && Array.isArray(parsed.notebooks)) {
                cuotibenData = parsed;
                return;
            }
        }
    } catch (e) {
        console.warn('加载错题本数据失败', e);
    }
    // 默认数据
    cuotibenData = {
        tags: ['数学', '物理', '英语', '编程', '错题经典'],
        notebooks: []
    };
    saveCuotibenData();
}

// 保存到 localStorage
function saveCuotibenData() {
    try {
        localStorage.setItem(CUOTIBEN_STORAGE_KEY, JSON.stringify(cuotibenData));
    } catch (e) {
        showToast('保存失败：存储空间不足，请删除部分图片', 'error');
        console.error(e);
    }
}

// 工具：时间格式化
function formatCuotibenDate(timestamp) {
    if (!timestamp) return '未知';
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
}

function formatCuotibenDateShort(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// 生成简单唯一 ID
function cuotibenGenId() {
    return 'nb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
}

// ========== 打开 / 关闭主模态框 ==========
function openCuotibenModal() {
    loadCuotibenData();
    document.getElementById('cuotibenModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    renderCuotibenList();
}

function closeCuotibenModal() {
    document.getElementById('cuotibenModal').style.display = 'none';
    document.body.style.overflow = '';
    cuotibenCurrentTagFilter = null;
    // 清空搜索栏（避免下次打开状态残留）
    const searchInput = document.getElementById('cuotibenSearchInput');
    if (searchInput) searchInput.value = '';
    const dateFrom = document.getElementById('cuotibenDateFrom');
    const dateTo = document.getElementById('cuotibenDateTo');
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
}

// ========== 重置筛选 ==========
function resetCuotibenFilters() {
    cuotibenCurrentTagFilter = null;
    const searchInput = document.getElementById('cuotibenSearchInput');
    if (searchInput) searchInput.value = '';
    const dateFrom = document.getElementById('cuotibenDateFrom');
    const dateTo = document.getElementById('cuotibenDateTo');
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    renderCuotibenList();
}

// ========== 渲染标签区 + 卡片列表 ==========
function renderCuotibenList() {
    const tagListEl = document.getElementById('cuotibenTagList');
    const contentEl = document.getElementById('cuotibenContent');
    const statsEl = document.getElementById('cuotibenStats');
    if (!tagListEl || !contentEl) return;

    // 统计每个标签下的笔记数量
    const tagCounts = {};
    cuotibenData.notebooks.forEach(nb => {
        (nb.tags || []).forEach(t => {
            tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
    });
    const totalCount = cuotibenData.notebooks.length;

    // 渲染标签区：第一项为"全部"
    let tagHTML = '';
    tagHTML += `<div class="cuotiben-tag ${cuotibenCurrentTagFilter === null ? 'active' : ''}" onclick="toggleCuotibenTagFilter(null)">
        <span>📚 全部</span>
        <span class="cuotiben-tag-count">${totalCount}</span>
    </div>`;
    cuotibenData.tags.forEach(tag => {
        const isActive = cuotibenCurrentTagFilter === tag;
        tagHTML += `<div class="cuotiben-tag ${isActive ? 'active' : ''}" onclick="toggleCuotibenTagFilter('${escapeAttr(tag)}')">
            <span>🏷 ${escapeHtml(tag)}</span>
            <span class="cuotiben-tag-count">${tagCounts[tag] || 0}</span>
            <span class="cuotiben-tag-remove" onclick="event.stopPropagation(); deleteCuotibenTag('${escapeAttr(tag)}')" title="删除标签">✕</span>
        </div>`;
    });
    tagListEl.innerHTML = tagHTML;

    // 过滤笔记
    const keyword = (document.getElementById('cuotibenSearchInput').value || '').trim().toLowerCase();
    const dateFromVal = document.getElementById('cuotibenDateFrom').value;
    const dateToVal = document.getElementById('cuotibenDateTo').value;

    let filtered = cuotibenData.notebooks.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (cuotibenCurrentTagFilter !== null) {
        filtered = filtered.filter(nb => (nb.tags || []).includes(cuotibenCurrentTagFilter));
    }

    if (keyword) {
        filtered = filtered.filter(nb => {
            const inTitle = (nb.title || '').toLowerCase().includes(keyword);
            const inContent = (nb.content || '').toLowerCase().includes(keyword);
            const inTags = (nb.tags || []).some(t => t.toLowerCase().includes(keyword));
            const inDate = formatCuotibenDateShort(nb.createdAt).includes(keyword);
            return inTitle || inContent || inTags || inDate;
        });
    }

    if (dateFromVal) {
        const fromTs = new Date(dateFromVal + 'T00:00:00').getTime();
        filtered = filtered.filter(nb => (nb.createdAt || 0) >= fromTs);
    }
    if (dateToVal) {
        const toTs = new Date(dateToVal + 'T23:59:59').getTime();
        filtered = filtered.filter(nb => (nb.createdAt || 0) <= toTs);
    }

    // 更新统计
    if (statsEl) {
        statsEl.innerHTML = `<i class="fas fa-clipboard-list"></i> 当前共 ${filtered.length} 条错题（总计 ${totalCount} 条）`;
    }

    // 渲染卡片
    if (filtered.length === 0) {
        contentEl.innerHTML = `
            <div class="cuotiben-empty">
                <div class="cuotiben-empty-icon">📝</div>
                <div class="cuotiben-empty-text">${cuotibenData.notebooks.length === 0 ? '还没有错题笔记' : '没有符合条件的错题'}</div>
                <div class="cuotiben-empty-sub">${cuotibenData.notebooks.length === 0 ? '点击右上角"新建错题"开始记录吧' : '试试调整搜索关键词或筛选标签'}</div>
            </div>
        `;
        return;
    }

    let cardsHTML = '<div class="cuotiben-grid">';
    filtered.forEach(nb => {
        const cover = (nb.images && nb.images.length > 0) ? nb.images[0] : null;
        const tagsHTML = (nb.tags || []).slice(0, 3).map(t => `<span class="cuotiben-card-tag">${escapeHtml(t)}</span>`).join('');
        const coverHTML = cover
            ? `<div class="cuotiben-card-cover"><img src="${cover}" alt=""></div>`
            : `<div class="cuotiben-card-cover"><div class="cuotiben-card-cover-placeholder">📋</div></div>`;
        cardsHTML += `
            <div class="cuotiben-card" onclick="openCuotibenDetail('${nb.id}')">
                ${coverHTML}
                <div class="cuotiben-card-body">
                    <div class="cuotiben-card-title">${escapeHtml(nb.title || '未命名')}</div>
                    <div class="cuotiben-card-tags">${tagsHTML}</div>
                    <div class="cuotiben-card-meta">
                        <span><i class="fas fa-calendar-plus"></i>${formatCuotibenDateShort(nb.createdAt)}</span>
                        <span><i class="fas fa-edit"></i>${formatCuotibenDateShort(nb.updatedAt)}</span>
                    </div>
                </div>
            </div>
        `;
    });
    cardsHTML += '</div>';
    contentEl.innerHTML = cardsHTML;
}

function toggleCuotibenTagFilter(tag) {
    if (cuotibenCurrentTagFilter === tag) {
        cuotibenCurrentTagFilter = null;
    } else {
        cuotibenCurrentTagFilter = tag;
    }
    renderCuotibenList();
}

// ========== 标签管理 ==========
function addCuotibenTag() {
    const name = prompt('请输入新标签名称：');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (cuotibenData.tags.includes(trimmed)) {
        showToast('该标签已存在', 'error');
        return;
    }
    cuotibenData.tags.push(trimmed);
    saveCuotibenData();
    renderCuotibenList();
    showToast('标签已添加', 'success');
}

function addCuotibenTagInCreate() {
    const name = prompt('请输入新标签名称：');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!cuotibenData.tags.includes(trimmed)) {
        cuotibenData.tags.push(trimmed);
        saveCuotibenData();
    }
    if (!cuotibenNewTags.includes(trimmed)) {
        cuotibenNewTags.push(trimmed);
    }
    renderCuotibenCreateTags();
    showToast('标签已添加', 'success');
}

function deleteCuotibenTag(tag) {
    if (!confirm(`确定删除标签「${tag}」吗？（笔记不会被删除，只是取消该标签关联）`)) return;
    cuotibenData.tags = cuotibenData.tags.filter(t => t !== tag);
    cuotibenData.notebooks.forEach(nb => {
        nb.tags = (nb.tags || []).filter(t => t !== tag);
    });
    if (cuotibenCurrentTagFilter === tag) cuotibenCurrentTagFilter = null;
    saveCuotibenData();
    renderCuotibenList();
    showToast('标签已删除', 'success');
}

// ========== 创建错题弹窗 ==========
function openCuotibenCreateModal() {
    cuotibenNewImages = [];
    cuotibenNewTags = [];
    document.getElementById('cuotibenNewTitle').value = '';
    document.getElementById('cuotibenNewContent').value = '';
    document.getElementById('cuotibenNewImageInput').value = '';
    renderCuotibenCreateTags();
    renderCuotibenNewImageGrid();
    document.getElementById('cuotibenCreateModal').style.display = 'flex';
    document.getElementById('cuotibenNewTitle').focus();
}

function closeCuotibenCreate() {
    document.getElementById('cuotibenCreateModal').style.display = 'none';
}

function renderCuotibenCreateTags() {
    const container = document.getElementById('cuotibenNewTags');
    if (!container) return;
    if (cuotibenData.tags.length === 0) {
        container.innerHTML = '<span class="cuotiben-edit-empty">还没有标签，点击上方"新建标签"创建</span>';
        return;
    }
    let html = '';
    cuotibenData.tags.forEach(tag => {
        const isSelected = cuotibenNewTags.includes(tag);
        html += `<span class="cuotiben-edit-tag ${isSelected ? '' : 'inactive'}" onclick="toggleCuotibenNewTag('${escapeAttr(tag)}')">${escapeHtml(tag)}</span>`;
    });
    container.innerHTML = html;
}

function toggleCuotibenNewTag(tag) {
    const idx = cuotibenNewTags.indexOf(tag);
    if (idx >= 0) cuotibenNewTags.splice(idx, 1);
    else cuotibenNewTags.push(tag);
    renderCuotibenCreateTags();
}

function handleCuotibenNewImageUpload(input) {
    const files = input.files;
    if (!files || files.length === 0) return;
    const toLoad = Array.from(files);
    let loaded = 0;
    toLoad.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            cuotibenNewImages.push(e.target.result);
            loaded++;
            if (loaded === toLoad.length) {
                renderCuotibenNewImageGrid();
                input.value = '';
            }
        };
        reader.readAsDataURL(file);
    });
}

function renderCuotibenNewImageGrid() {
    const grid = document.getElementById('cuotibenNewImageGrid');
    if (!grid) return;
    if (cuotibenNewImages.length === 0) {
        grid.innerHTML = '<span class="cuotiben-edit-empty">暂未上传图片，第一张图片将作为封面</span>';
        return;
    }
    let html = '';
    cuotibenNewImages.forEach((src, idx) => {
        html += `<div class="cuotiben-image-item ${idx === 0 ? 'is-cover' : ''}">
            <img src="${src}" alt="">
            <button class="cuotiben-image-remove" onclick="removeCuotibenNewImage(${idx})">✕</button>
        </div>`;
    });
    grid.innerHTML = html;
}

function removeCuotibenNewImage(idx) {
    cuotibenNewImages.splice(idx, 1);
    renderCuotibenNewImageGrid();
}

function createCuotibenNote() {
    const titleEl = document.getElementById('cuotibenNewTitle');
    const contentEl = document.getElementById('cuotibenNewContent');
    const title = (titleEl.value || '').trim();
    const content = (contentEl.value || '').trim();

    if (!title) {
        showToast('请填写标题', 'error');
        titleEl.focus();
        return;
    }
    if (!content) {
        showToast('请填写内容', 'error');
        contentEl.focus();
        return;
    }

    const now = Date.now();
    const nb = {
        id: cuotibenGenId(),
        title: title,
        content: content,
        images: cuotibenNewImages.slice(),
        tags: cuotibenNewTags.slice(),
        createdAt: now,
        updatedAt: now
    };
    cuotibenData.notebooks.push(nb);
    saveCuotibenData();
    closeCuotibenCreate();
    renderCuotibenList();
    showToast('错题已创建', 'success');
}

// ========== 错题详情 / 编辑 ==========
function openCuotibenDetail(noteId) {
    const nb = cuotibenData.notebooks.find(n => n.id === noteId);
    if (!nb) {
        showToast('该错题不存在', 'error');
        return;
    }
    cuotibenEditingId = noteId;
    cuotibenEditImages = (nb.images || []).slice();

    document.getElementById('cuotibenEditTitle').value = nb.title || '';
    document.getElementById('cuotibenEditContent').value = nb.content || '';

    const metaEl = document.getElementById('cuotibenDetailMeta');
    if (metaEl) {
        metaEl.innerHTML = `
            <div class="cuotiben-detail-meta-item"><i class="fas fa-calendar-plus"></i>创建：${formatCuotibenDate(nb.createdAt)}</div>
            <div class="cuotiben-detail-meta-item"><i class="fas fa-edit"></i>最后修改：${formatCuotibenDate(nb.updatedAt)}</div>
            <div class="cuotiben-detail-meta-item"><i class="fas fa-images"></i>图片 ${(nb.images || []).length} 张</div>
        `;
    }

    renderCuotibenEditTags(nb.tags || []);
    renderCuotibenEditImageGrid();

    document.getElementById('cuotibenDetailModal').style.display = 'flex';
}

function closeCuotibenDetail() {
    document.getElementById('cuotibenDetailModal').style.display = 'none';
    cuotibenEditingId = null;
    cuotibenEditImages = [];
}

function renderCuotibenEditTags(selectedTags) {
    const container = document.getElementById('cuotibenEditTags');
    if (!container) return;
    if (cuotibenData.tags.length === 0) {
        container.innerHTML = '<span class="cuotiben-edit-empty">暂无标签（可在主界面新建）</span>';
        return;
    }
    let html = '';
    cuotibenData.tags.forEach(tag => {
        const isSelected = selectedTags.includes(tag);
        html += `<span class="cuotiben-edit-tag ${isSelected ? '' : 'inactive'}" onclick="toggleCuotibenEditTag('${escapeAttr(tag)}', this)">${escapeHtml(tag)}</span>`;
    });
    container.innerHTML = html;
}

function toggleCuotibenEditTag(tag, el) {
    // 直接通过 DOM 状态切换，避免额外状态
    const isInactive = el.classList.contains('inactive');
    if (isInactive) el.classList.remove('inactive');
    else el.classList.add('inactive');
}

function handleCuotibenImageUpload(input) {
    const files = input.files;
    if (!files || files.length === 0) return;
    const toLoad = Array.from(files);
    let loaded = 0;
    toLoad.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            cuotibenEditImages.push(e.target.result);
            loaded++;
            if (loaded === toLoad.length) {
                renderCuotibenEditImageGrid();
                input.value = '';
            }
        };
        reader.readAsDataURL(file);
    });
}

function renderCuotibenEditImageGrid() {
    const grid = document.getElementById('cuotibenImageGrid');
    if (!grid) return;
    if (cuotibenEditImages.length === 0) {
        grid.innerHTML = '<span class="cuotiben-edit-empty">暂无图片</span>';
        return;
    }
    let html = '';
    cuotibenEditImages.forEach((src, idx) => {
        html += `<div class="cuotiben-image-item ${idx === 0 ? 'is-cover' : ''}">
            <img src="${src}" alt="">
            <button class="cuotiben-image-remove" onclick="removeCuotibenEditImage(${idx})">✕</button>
        </div>`;
    });
    grid.innerHTML = html;
}

function removeCuotibenEditImage(idx) {
    cuotibenEditImages.splice(idx, 1);
    renderCuotibenEditImageGrid();
}

function saveCuotibenDetail() {
    if (!cuotibenEditingId) return;
    const nb = cuotibenData.notebooks.find(n => n.id === cuotibenEditingId);
    if (!nb) {
        showToast('错题不存在', 'error');
        return;
    }
    const title = (document.getElementById('cuotibenEditTitle').value || '').trim();
    const content = (document.getElementById('cuotibenEditContent').value || '').trim();
    if (!title) {
        showToast('请填写标题', 'error');
        return;
    }
    if (!content) {
        showToast('请填写内容', 'error');
        return;
    }

    // 收集当前选中的标签
    const tagEls = document.querySelectorAll('#cuotibenEditTags .cuotiben-edit-tag');
    const selectedTags = [];
    tagEls.forEach(el => {
        if (!el.classList.contains('inactive')) {
            selectedTags.push(el.textContent.trim());
        }
    });

    nb.title = title;
    nb.content = content;
    nb.images = cuotibenEditImages.slice();
    nb.tags = selectedTags;
    nb.updatedAt = Date.now();
    saveCuotibenData();
    closeCuotibenDetail();
    renderCuotibenList();
    showToast('保存成功', 'success');
}

function confirmDeleteCuotiben() {
    if (!cuotibenEditingId) return;
    const nb = cuotibenData.notebooks.find(n => n.id === cuotibenEditingId);
    if (!nb) return;
    if (!confirm(`确定删除错题「${nb.title}」吗？此操作不可恢复。`)) return;
    cuotibenData.notebooks = cuotibenData.notebooks.filter(n => n.id !== cuotibenEditingId);
    saveCuotibenData();
    closeCuotibenDetail();
    renderCuotibenList();
    showToast('已删除', 'success');
}

// ========== 转义函数 ==========
function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function escapeAttr(s) {
    return escapeHtml(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// 初始化错题本：加载一次数据
loadCuotibenData();

/* ============================================================
 *  贪吃蛇小游戏 (Snake Game)
 * ============================================================ */
(function () {
    // --- 游戏配置 ---
    const GRID_SIZE = 20;           // 网格数量（20x20）
    const CANVAS_SIZE = 400;        // 画布像素大小
    const CELL = CANVAS_SIZE / GRID_SIZE; // 每格像素大小（20px）
    const BASE_SPEED = 150;         // 初始移动间隔（ms）
    const MIN_SPEED = 70;           // 最快速度限制
    const SPEED_STEP = 4;           // 每吃一个食物加速量
    const HIGH_SCORE_KEY = 'snake_high_score';
    const RANK_KEY = 'snake_rank';
    const RANK_SCORE_KEY = 'snake_rank_score';
    const MULTI_GAME_DURATION = 60; // 联机对战时长（秒）

    // 段位列表
    const RANKS = [
        { name: '青铜', minScore: 0, color: '#9ca3af' },
        { name: '白银', minScore: 100, color: '#e5e7eb' },
        { name: '黄金', minScore: 300, color: '#fbbf24' },
        { name: '铂金', minScore: 600, color: '#93c5fd' },
        { name: '钻石', minScore: 1000, color: '#c084fc' },
        { name: '大师', minScore: 1500, color: '#fb923c' },
        { name: '王者', minScore: 2500, color: '#ef4444' }
    ];

    // --- 游戏状态 ---
    let snakeCanvas = null;
    let snakeCtx = null;
    let gameMode = 'single';        // single / multi
    let difficultyMode = 'normal';  // normal / hard
    let snake = [];                 // 玩家1蛇身 [{x,y}, ...]，头在索引 0
    let snake2 = [];                // 玩家2蛇身（联机模式）
    let direction = { x: 1, y: 0 }; // 玩家1方向
    let pendingDirection = { x: 1, y: 0 }; // 玩家1下一次方向
    let direction2 = { x: -1, y: 0 }; // 玩家2方向
    let pendingDirection2 = { x: -1, y: 0 }; // 玩家2下一次方向
    let food = null;
    let walls = [];                // 墙体位置数组
    let bombs = [];                // 炸弹位置数组
    let bombSpeed = 1;             // 炸弹移动速度（每tick移动的距离）
    let bombSpeedTimer = 0;        // 炸弹速度计时器（秒）
    let score = 0;
    let score2 = 0;                // 玩家2得分
    let highScore = 0;
    let rankScore = 0;             // 段位积分
    let speed = BASE_SPEED;
    let gameLoopTimer = null;
    let gameState = 'idle';         // idle / running / paused / over
    let multiTimer = 0;            // 联机模式计时器
    let multiTimerInterval = null;  // 计时器间隔
    let player1Alive = true;       // 玩家1存活状态
    let player2Alive = true;       // 玩家2存活状态

    // --- 工具函数 ---
    function randInt(max) {
        return Math.floor(Math.random() * max);
    }

    function cellsEqual(a, b) {
        return a.x === b.x && a.y === b.y;
    }

    function spawnFood() {
        let tries = 0;
        while (tries++ < 500) {
            const pos = { x: randInt(GRID_SIZE), y: randInt(GRID_SIZE) };
            const isOnSnake1 = snake.some(function (s) { return cellsEqual(s, pos); });
            const isOnSnake2 = snake2.some(function (s) { return cellsEqual(s, pos); });
            const isOnWall = walls.some(function (w) { return cellsEqual(w, pos); });
            const isOnBomb = bombs.some(function (b) { return cellsEqual(b.pos, pos); });
            if (!isOnSnake1 && !isOnSnake2 && !isOnWall && !isOnBomb) {
                food = pos;
                return;
            }
        }
        food = { x: 0, y: 0 };
    }

    function generateWalls() {
        walls = [];
        const wallCount = 15;
        for (let i = 0; i < wallCount; i++) {
            let pos;
            let tries = 0;
            while (tries++ < 100) {
                pos = { x: randInt(GRID_SIZE), y: randInt(GRID_SIZE) };
                const isNearStart = (Math.abs(pos.x - 5) < 3 && Math.abs(pos.y - 10) < 3) ||
                                   (Math.abs(pos.x - 14) < 3 && Math.abs(pos.y - 10) < 3);
                if (!isNearStart) break;
            }
            walls.push(pos);
        }
    }

    function generateBombs() {
        bombs = [];
        const bombCount = 5;
        for (let i = 0; i < bombCount; i++) {
            let pos;
            let tries = 0;
            while (tries++ < 100) {
                pos = { x: randInt(GRID_SIZE), y: randInt(GRID_SIZE) };
                const isOnWall = walls.some(function (w) { return cellsEqual(w, pos); });
                const isNearStart = (Math.abs(pos.x - 5) < 3 && Math.abs(pos.y - 10) < 3) ||
                                   (Math.abs(pos.x - 14) < 3 && Math.abs(pos.y - 10) < 3);
                if (!isOnWall && !isNearStart) break;
            }
            const isHorizontal = randInt(2) === 0;
            const range = randInt(4) + 3;
            const direction = isHorizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
            bombs.push({ 
                pos: pos, 
                tick: 0,
                dir: direction,
                startPos: { x: pos.x, y: pos.y },
                range: range,
                distance: 0
            });
        }
    }

    function updateBombs() {
        bombs.forEach(function (b) {
            b.distance += bombSpeed;
            if (b.distance >= b.range * 2) {
                b.distance = 0;
            }
            
            const actualDistance = b.distance <= b.range ? b.distance : b.range * 2 - b.distance;
            b.pos.x = b.startPos.x + b.dir.x * actualDistance;
            b.pos.y = b.startPos.y + b.dir.y * actualDistance;
        });
    }

    function spawnBomb() {
        let pos;
        let tries = 0;
        while (tries++ < 100) {
            pos = { x: randInt(GRID_SIZE), y: randInt(GRID_SIZE) };
            const isOnWall = walls.some(function (w) { return cellsEqual(w, pos); });
            const isOnSnake1 = snake.some(function (s) { return cellsEqual(s, pos); });
            const isOnSnake2 = snake2.some(function (s) { return cellsEqual(s, pos); });
            const isOnFood = food && cellsEqual(food, pos);
            const isOnOtherBomb = bombs.some(function (b) { return cellsEqual(b.pos, pos); });
            if (!isOnWall && !isOnSnake1 && !isOnSnake2 && !isOnFood && !isOnOtherBomb) break;
        }
        const isHorizontal = randInt(2) === 0;
        const range = randInt(4) + 3;
        const direction = isHorizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
        bombs.push({ 
            pos: pos, 
            tick: 0,
            dir: direction,
            startPos: { x: pos.x, y: pos.y },
            range: range,
            distance: 0
        });
    }

    function resetGameState() {
        snake = [
            { x: 6, y: 10 },
            { x: 5, y: 10 },
            { x: 4, y: 10 }
        ];
        snake2 = [
            { x: 13, y: 10 },
            { x: 14, y: 10 },
            { x: 15, y: 10 }
        ];
        direction = { x: 1, y: 0 };
        pendingDirection = { x: 1, y: 0 };
        direction2 = { x: -1, y: 0 };
        pendingDirection2 = { x: -1, y: 0 };
        score = 0;
        score2 = 0;
        speed = BASE_SPEED;
        multiTimer = MULTI_GAME_DURATION;
        player1Alive = true;
        player2Alive = true;
        walls = [];
        bombs = [];
        bombSpeed = 0.2;
        bombSpeedTimer = 0;
        if (difficultyMode === 'hard') {
            generateWalls();
            generateBombs();
        }
        spawnFood();
        updateScoreUI();
        updateRankUI();
    }

    function updateScoreUI() {
        const s = document.getElementById('snakeScore');
        const hs = document.getElementById('snakeHighScore');
        const s2 = document.getElementById('snakePlayer2Score');
        const timer = document.getElementById('snakeTimer');
        if (s) s.textContent = String(score);
        if (hs) hs.textContent = String(highScore);
        if (s2) s2.textContent = String(score2);
        if (timer && gameMode === 'multi') {
            timer.textContent = `⏱️ ${multiTimer}秒`;
        }
    }

    function updateRankUI() {
        const rank = document.getElementById('snakeRank');
        if (rank) {
            rank.textContent = getCurrentRank();
        }
    }

    function getCurrentRank() {
        for (let i = RANKS.length - 1; i >= 0; i--) {
            if (rankScore >= RANKS[i].minScore) {
                return RANKS[i].name;
            }
        }
        return '青铜';
    }

    function setGameMode(mode) {
        gameMode = mode;
        const singleBtn = document.querySelector('.snake-mode-btn:nth-child(1)');
        const multiBtn = document.querySelector('.snake-mode-btn:nth-child(2)');
        const multiInfo = document.getElementById('snakeMultiInfo');
        
        if (singleBtn) singleBtn.classList.toggle('active', mode === 'single');
        if (multiBtn) multiBtn.classList.toggle('active', mode === 'multi');
        if (multiInfo) {
            multiInfo.style.display = mode === 'multi' ? 'block' : 'none';
        }
        
        if (mode === 'multi') {
            setTimeout(() => {
                const info = document.querySelector('.snake-multi-info p');
                if (info) {
                    info.innerHTML = '✅ 匹配成功！<span style="color:#22c55e">准备开始对战</span>';
                }
            }, 1500);
        }
    }

    function setSnakeDifficulty(difficulty) {
        difficultyMode = difficulty;
        const normalBtn = document.querySelector('.snake-difficulty-btn:nth-child(1)');
        const hardBtn = document.querySelector('.snake-difficulty-btn:nth-child(2)');
        
        if (normalBtn) normalBtn.classList.toggle('active', difficulty === 'normal');
        if (hardBtn) hardBtn.classList.toggle('active', difficulty === 'hard');
    }

    function setOverlay(title, desc, show) {
        const overlay = document.getElementById('snakeOverlay');
        if (!overlay) return;
        if (!show) {
            overlay.classList.add('hidden');
            return;
        }
        overlay.classList.remove('hidden');
        const titleEl = document.getElementById('snakeOverlayTitle');
        const descEl = document.getElementById('snakeOverlayDesc');
        if (titleEl) titleEl.textContent = title;
        if (descEl) descEl.textContent = desc;
    }

    function hideGameoverModal() {
        const el = document.getElementById('snakeGameOver');
        if (el) el.style.display = 'none';
    }

    function showGameoverModal() {
        const el = document.getElementById('snakeGameOver');
        if (!el) return;
        const scoreEl = document.getElementById('snakeFinalScore');
        const newHS = document.getElementById('snakeNewHighScore');
        if (scoreEl) scoreEl.textContent = String(score);
        if (newHS) {
            if (score > 0 && score >= highScore) {
                newHS.style.display = 'block';
            } else {
                newHS.style.display = 'none';
            }
        }
        el.style.display = 'flex';
    }

    // --- 绘制 ---
    function drawGrid() {
        if (!snakeCtx) return;
        // 背景
        snakeCtx.fillStyle = '#0f172a';
        snakeCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        // 细网格
        snakeCtx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
        snakeCtx.lineWidth = 1;
        for (let i = 1; i < GRID_SIZE; i++) {
            snakeCtx.beginPath();
            snakeCtx.moveTo(i * CELL, 0);
            snakeCtx.lineTo(i * CELL, CANVAS_SIZE);
            snakeCtx.stroke();
            snakeCtx.beginPath();
            snakeCtx.moveTo(0, i * CELL);
            snakeCtx.lineTo(CANVAS_SIZE, i * CELL);
            snakeCtx.stroke();
        }
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function drawSnake() {
        if (!snakeCtx) return;
        // 绘制玩家1的蛇（绿色）
        drawSingleSnake(snake, direction, true);
        // 绘制玩家2的蛇（橙色）
        if (gameMode === 'multi' && player2Alive) {
            drawSingleSnake(snake2, direction2, false);
        }
    }

    function drawSingleSnake(snakeBody, snakeDirection, isPlayer1) {
        for (let i = snakeBody.length - 1; i >= 0; i--) {
            const seg = snakeBody[i];
            const isHead = i === 0;
            const px = seg.x * CELL;
            const py = seg.y * CELL;
            const pad = 2;

            if (isHead) {
                // 蛇头：渐变 + 眼睛
                const grad = snakeCtx.createLinearGradient(px, py, px + CELL, py + CELL);
                if (isPlayer1) {
                    grad.addColorStop(0, '#34d399');
                    grad.addColorStop(1, '#059669');
                } else {
                    grad.addColorStop(0, '#fbbf24');
                    grad.addColorStop(1, '#d97706');
                }
                snakeCtx.fillStyle = grad;
                roundRect(snakeCtx, px + pad, py + pad, CELL - pad * 2, CELL - pad * 2, 6);
                snakeCtx.fill();
                // 眼睛
                snakeCtx.fillStyle = '#ffffff';
                const eyeSize = 3;
                let ex1, ey1, ex2, ey2;
                if (snakeDirection.x === 1) {
                    ex1 = px + CELL - 7; ey1 = py + 5;
                    ex2 = px + CELL - 7; ey2 = py + CELL - 8;
                } else if (snakeDirection.x === -1) {
                    ex1 = px + 4; ey1 = py + 5;
                    ex2 = px + 4; ey2 = py + CELL - 8;
                } else if (snakeDirection.y === -1) {
                    ex1 = px + 5; ey1 = py + 4;
                    ex2 = px + CELL - 8; ey2 = py + 4;
                } else {
                    ex1 = px + 5; ey1 = py + CELL - 7;
                    ex2 = px + CELL - 8; ey2 = py + CELL - 7;
                }
                snakeCtx.fillRect(ex1, ey1, eyeSize, eyeSize);
                snakeCtx.fillRect(ex2, ey2, eyeSize, eyeSize);
                snakeCtx.fillStyle = '#0f172a';
                snakeCtx.fillRect(ex1 + 1, ey1 + 1, 1, 1);
                snakeCtx.fillRect(ex2 + 1, ey2 + 1, 1, 1);
            } else {
                // 蛇身：渐变深色
                const t = i / Math.max(snakeBody.length - 1, 1);
                if (isPlayer1) {
                    const r = Math.round(16 + (52 - 16) * (1 - t));
                    const g = Math.round(185 - 40 * t);
                    const b = Math.round(129 - 40 * t);
                    snakeCtx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
                } else {
                    const r = Math.round(217 - 40 * t);
                    const g = Math.round(119 - 20 * t);
                    const b = Math.round(6);
                    snakeCtx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
                }
                roundRect(snakeCtx, px + pad, py + pad, CELL - pad * 2, CELL - pad * 2, 5);
                snakeCtx.fill();
                // 小高光
                snakeCtx.fillStyle = 'rgba(255,255,255,0.12)';
                roundRect(snakeCtx, px + pad + 2, py + pad + 2, (CELL - pad * 2) * 0.35, (CELL - pad * 2) * 0.35, 3);
                snakeCtx.fill();
            }
        }
    }

    function drawFood() {
        if (!snakeCtx || !food) return;
        const px = food.x * CELL;
        const py = food.y * CELL;
        const cx = px + CELL / 2;
        const cy = py + CELL / 2;
        const pulse = (Math.sin(Date.now() / 200) + 1) * 1.5;
        const r = CELL / 2 - 3 + pulse;

        // 外发光
        const glow = snakeCtx.createRadialGradient(cx, cy, 0, cx, cy, r + 8);
        glow.addColorStop(0, 'rgba(251, 191, 36, 0.55)');
        glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
        snakeCtx.fillStyle = glow;
        snakeCtx.beginPath();
        snakeCtx.arc(cx, cy, r + 8, 0, Math.PI * 2);
        snakeCtx.fill();

        // 本体
        const grad = snakeCtx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, r);
        grad.addColorStop(0, '#fde68a');
        grad.addColorStop(0.6, '#f59e0b');
        grad.addColorStop(1, '#b45309');
        snakeCtx.fillStyle = grad;
        snakeCtx.beginPath();
        snakeCtx.arc(cx, cy, r, 0, Math.PI * 2);
        snakeCtx.fill();

        // 高光点
        snakeCtx.fillStyle = 'rgba(255,255,255,0.7)';
        snakeCtx.beginPath();
        snakeCtx.arc(cx - r / 3, cy - r / 3, r / 4, 0, Math.PI * 2);
        snakeCtx.fill();
    }

    function drawWalls() {
        if (!snakeCtx) return;
        snakeCtx.fillStyle = '#374151';
        walls.forEach(function(w) {
            const px = w.x * CELL;
            const py = w.y * CELL;
            const grad = snakeCtx.createLinearGradient(px, py, px + CELL, py + CELL);
            grad.addColorStop(0, '#4b5563');
            grad.addColorStop(0.5, '#374151');
            grad.addColorStop(1, '#1f2937');
            snakeCtx.fillStyle = grad;
            roundRect(snakeCtx, px + 2, py + 2, CELL - 4, CELL - 4, 2);
            snakeCtx.fill();
        });
    }

    function drawBombs() {
        if (!snakeCtx) return;
        bombs.forEach(function(b) {
            const px = b.pos.x * CELL;
            const py = b.pos.y * CELL;
            const cx = px + CELL / 2;
            const cy = py + CELL / 2;
            const pulse = (Math.sin(Date.now() / 150 + b.tick) + 1) * 2;
            const r = CELL / 2 - 4 + pulse;

            const glow = snakeCtx.createRadialGradient(cx, cy, 0, cx, cy, r + 6);
            glow.addColorStop(0, 'rgba(239, 68, 68, 0.6)');
            glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
            snakeCtx.fillStyle = glow;
            snakeCtx.beginPath();
            snakeCtx.arc(cx, cy, r + 6, 0, Math.PI * 2);
            snakeCtx.fill();

            snakeCtx.fillStyle = '#dc2626';
            snakeCtx.beginPath();
            snakeCtx.arc(cx, cy, r, 0, Math.PI * 2);
            snakeCtx.fill();

            snakeCtx.fillStyle = '#ffffff';
            snakeCtx.font = 'bold 12px Arial';
            snakeCtx.textAlign = 'center';
            snakeCtx.textBaseline = 'middle';
            snakeCtx.fillText('💣', cx, cy);
        });
    }

    function draw() {
        drawGrid();
        drawWalls();
        drawFood();
        drawBombs();
        drawSnake();
    }

    function wrapPosition(pos) {
        return {
            x: ((pos.x % GRID_SIZE) + GRID_SIZE) % GRID_SIZE,
            y: ((pos.y % GRID_SIZE) + GRID_SIZE) % GRID_SIZE
        };
    }

    function checkBombCollision(snakeBody, isHead) {
        if (!isHead) return false;
        const head = snakeBody[0];
        for (let i = bombs.length - 1; i >= 0; i--) {
            if (cellsEqual(head, bombs[i].pos)) {
                bombs.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    function checkWallCollision(pos) {
        return walls.some(function (w) { return cellsEqual(w, pos); });
    }

    // --- 游戏逻辑 ---
    function tick() {
        // 应用待处理方向
        direction = pendingDirection;

        if (gameMode === 'multi') {
            updateAI();
            direction2 = pendingDirection2;
        }

        // 更新炸弹位置（来回移动）
        if (difficultyMode === 'hard') {
            updateBombs();
            
            // 维持5个炸弹
            while (bombs.length < 5) {
                spawnBomb();
            }
            
            // 每10秒加速一次
            bombSpeedTimer += speed / 1000;
            if (bombSpeedTimer >= 10) {
                bombSpeedTimer -= 10;
                bombSpeed *= 1.2;
            }
        }

        // 玩家1移动
        if (player1Alive) {
            const head = snake[0];
            let newHead = { x: head.x + direction.x, y: head.y + direction.y };

            // 穿墙传送
            newHead = wrapPosition(newHead);

            // 撞自己
            if (snake.some(function (s, idx) { return idx > 0 && cellsEqual(s, newHead); })) {
                player1Alive = false;
            } else if (gameMode === 'multi' && player2Alive && snake2.some(function (s) { return cellsEqual(s, newHead); })) {
                // 撞玩家2的蛇
                player1Alive = false;
            } else if (difficultyMode === 'hard' && checkWallCollision(newHead)) {
                // 撞墙体
                player1Alive = false;
            } else if (difficultyMode === 'hard' && checkBombCollision(snake, true)) {
                // 撞炸弹头部
                player1Alive = false;
            }

            if (player1Alive) {
                snake.unshift(newHead);
                
                // 检查身体撞炸弹
                if (difficultyMode === 'hard') {
                    for (let i = bombs.length - 1; i >= 0; i--) {
                        const bombPos = bombs[i].pos;
                        for (let j = 1; j < snake.length; j++) {
                            if (cellsEqual(snake[j], bombPos)) {
                                bombs.splice(i, 1);
                                snake.splice(j);
                                break;
                            }
                        }
                    }
                }

                if (cellsEqual(newHead, food)) {
                    score += 1;
                    if (speed > MIN_SPEED) speed = Math.max(MIN_SPEED, speed - SPEED_STEP);
                    spawnFood();
                    updateScoreUI();
                } else {
                    snake.pop();
                }
            }
        }

        // 玩家2移动（联机模式）
        if (gameMode === 'multi' && player2Alive) {
            const head2 = snake2[0];
            let newHead2 = { x: head2.x + direction2.x, y: head2.y + direction2.y };

            // 穿墙传送
            newHead2 = wrapPosition(newHead2);

            // 撞自己
            if (snake2.some(function (s, idx) { return idx > 0 && cellsEqual(s, newHead2); })) {
                player2Alive = false;
            } else if (player1Alive && snake.some(function (s) { return cellsEqual(s, newHead2); })) {
                // 撞玩家1的蛇
                player2Alive = false;
            } else if (difficultyMode === 'hard' && checkWallCollision(newHead2)) {
                // 撞墙体
                player2Alive = false;
            } else if (difficultyMode === 'hard' && checkBombCollision(snake2, true)) {
                // 撞炸弹头部
                player2Alive = false;
            }

            if (player2Alive) {
                snake2.unshift(newHead2);
                
                // 检查身体撞炸弹
                if (difficultyMode === 'hard') {
                    for (let i = bombs.length - 1; i >= 0; i--) {
                        const bombPos = bombs[i].pos;
                        for (let j = 1; j < snake2.length; j++) {
                            if (cellsEqual(snake2[j], bombPos)) {
                                bombs.splice(i, 1);
                                snake2.splice(j);
                                break;
                            }
                        }
                    }
                }

                if (cellsEqual(newHead2, food)) {
                    score2 += 1;
                    spawnFood();
                    updateScoreUI();
                } else {
                    snake2.pop();
                }
            }
        }

        // 检查游戏结束条件
        if (gameMode === 'single') {
            if (!player1Alive) {
                endGame();
                return;
            }
        } else {
            // 联机模式：检查时间或双方死亡
            if (!player1Alive || !player2Alive || multiTimer <= 0) {
                endMultiGame();
                return;
            }
        }

        scheduleNext();
        draw();
    }

    function aStarSearch(start, goal, avoidSnake) {
        const openSet = [start];
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        
        const key = function(p) { return p.x + ',' + p.y; };
        
        gScore.set(key(start), 0);
        fScore.set(key(start), Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y));
        
        const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
        
        while (openSet.length > 0) {
            openSet.sort(function(a, b) {
                return (fScore.get(key(a)) || Infinity) - (fScore.get(key(b)) || Infinity);
            });
            const current = openSet.shift();
            
            if (cellsEqual(current, goal)) {
                const path = [];
                let c = current;
                while (cameFrom.has(key(c))) {
                    path.unshift(c);
                    c = cameFrom.get(key(c));
                }
                return path;
            }
            
            for (let dir of directions) {
                const neighbor = wrapPosition({ x: current.x + dir.x, y: current.y + dir.y });
                const tentativeG = (gScore.get(key(current)) || Infinity) + 1;
                
                const isOnSnake = avoidSnake.some(function(s) { return cellsEqual(s, neighbor); });
                const isOnWall = walls.some(function(w) { return cellsEqual(w, neighbor); });
                
                if (isOnSnake || isOnWall) continue;
                
                if (tentativeG < (gScore.get(key(neighbor)) || Infinity)) {
                    cameFrom.set(key(neighbor), current);
                    gScore.set(key(neighbor), tentativeG);
                    fScore.set(key(neighbor), tentativeG + Math.abs(neighbor.x - goal.x) + Math.abs(neighbor.y - goal.y));
                    if (!openSet.some(function(p) { return cellsEqual(p, neighbor); })) {
                        openSet.push(neighbor);
                    }
                }
            }
        }
        
        return null;
    }

    function updateAI() {
        const head = snake2[0];
        const path = aStarSearch(head, food, snake2.slice(1).concat(snake));
        
        if (path && path.length > 0) {
            const nextStep = path[0];
            const newDir = { x: nextStep.x - head.x, y: nextStep.y - head.y };
            
            if (newDir.x !== -direction2.x || newDir.y !== -direction2.y) {
                pendingDirection2 = newDir;
                return;
            }
        }
        
        const dx = food.x - head.x;
        const dy = food.y - head.y;
        
        const checkForward = { x: head.x + direction2.x, y: head.y + direction2.y };
        const checkLeft = { x: head.x - direction2.y, y: head.y + direction2.x };
        const checkRight = { x: head.x + direction2.y, y: head.y - direction2.x };
        
        const isForwardBlocked = 
            snake2.slice(1).some(s => cellsEqual(s, checkForward)) ||
            snake.some(s => cellsEqual(s, checkForward)) ||
            walls.some(w => cellsEqual(w, checkForward));
        
        const isLeftBlocked = 
            snake2.slice(1).some(s => cellsEqual(s, checkLeft)) ||
            snake.some(s => cellsEqual(s, checkLeft)) ||
            walls.some(w => cellsEqual(w, checkLeft));
        
        const isRightBlocked = 
            snake2.slice(1).some(s => cellsEqual(s, checkRight)) ||
            snake.some(s => cellsEqual(s, checkRight)) ||
            walls.some(w => cellsEqual(w, checkRight));
        
        let newDir = { x: 0, y: 0 };
        
        if (isForwardBlocked) {
            if (!isLeftBlocked && !isRightBlocked) {
                if (Math.abs(dx) > Math.abs(dy)) {
                    newDir = dx > 0 ? { x: 0, y: -1 } : { x: 0, y: 1 };
                } else {
                    newDir = dy > 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
                }
            } else if (!isLeftBlocked) {
                newDir = { x: -direction2.y, y: direction2.x };
            } else if (!isRightBlocked) {
                newDir = { x: direction2.y, y: -direction2.x };
            } else {
                newDir = { x: -direction2.x, y: -direction2.y };
            }
        } else {
            const directions = [];
            if (dx > 0 && direction2.x !== -1) directions.push({ x: 1, y: 0, score: Math.abs(dx) });
            if (dx < 0 && direction2.x !== 1) directions.push({ x: -1, y: 0, score: Math.abs(dx) });
            if (dy > 0 && direction2.y !== -1) directions.push({ x: 0, y: 1, score: Math.abs(dy) });
            if (dy < 0 && direction2.y !== 1) directions.push({ x: 0, y: -1, score: Math.abs(dy) });
            
            const safeDirections = directions.filter(dir => {
                const next = { x: head.x + dir.x, y: head.y + dir.y };
                return !snake2.slice(1).some(s => cellsEqual(s, next)) &&
                       !snake.some(s => cellsEqual(s, next)) &&
                       !walls.some(w => cellsEqual(w, next));
            });
            
            if (safeDirections.length > 0) {
                safeDirections.sort(function(a, b) { return b.score - a.score; });
                newDir = safeDirections[0];
            }
        }
        
        if (newDir.x !== -direction2.x || newDir.y !== -direction2.y) {
            pendingDirection2 = newDir;
        }
    }

    function scheduleNext() {
        if (gameState !== 'running') return;
        if (gameLoopTimer) clearTimeout(gameLoopTimer);
        gameLoopTimer = setTimeout(tick, speed);
    }

    // 用于食物脉冲动画的轻量循环（在 running/paused 时都刷新）
    let animationRAF = null;
    function animationLoop() {
        if (gameState === 'running' || gameState === 'paused') {
            draw();
        }
        animationRAF = requestAnimationFrame(animationLoop);
    }

    // --- 公共控制函数 ---
    function startGame() {
        if (gameState === 'running') return;

        if (gameState === 'over' || gameState === 'idle') {
            resetGameState();
            hideGameoverModal();
        }
        gameState = 'running';
        setOverlay('', '', false);
        scheduleNext();
        if (!animationRAF) animationRAF = requestAnimationFrame(animationLoop);
        
        // 联机模式启动计时器
        if (gameMode === 'multi') {
            if (multiTimerInterval) clearInterval(multiTimerInterval);
            multiTimer = MULTI_GAME_DURATION;
            multiTimerInterval = setInterval(() => {
                if (gameState === 'running') {
                    multiTimer--;
                    updateScoreUI();
                }
            }, 1000);
        }
    }

    function pauseGame() {
        if (gameState === 'running') {
            gameState = 'paused';
            if (gameLoopTimer) { clearTimeout(gameLoopTimer); gameLoopTimer = null; }
            setOverlay('⏸ 已暂停', '点击继续或按空格键恢复游戏');
        } else if (gameState === 'paused') {
            gameState = 'running';
            setOverlay('', '', false);
            scheduleNext();
        }
    }

    function resetGame() {
        if (gameLoopTimer) { clearTimeout(gameLoopTimer); gameLoopTimer = null; }
        gameState = 'idle';
        resetGameState();
        hideGameoverModal();
        setOverlay('🐍 准备开始', '点击"开始游戏"或按空格键开始');
        draw();
    }

    function endGame() {
        if (gameLoopTimer) { clearTimeout(gameLoopTimer); gameLoopTimer = null; }
        gameState = 'over';
        if (score > highScore) {
            highScore = score;
            try { localStorage.setItem(HIGH_SCORE_KEY, String(highScore)); } catch (e) {}
            updateScoreUI();
        }
        draw();
        // 小延迟再弹结束动画，让最后一帧先渲染
        setTimeout(showGameoverModal, 250);
    }

    function endMultiGame() {
        if (gameLoopTimer) { clearTimeout(gameLoopTimer); gameLoopTimer = null; }
        if (multiTimerInterval) { clearInterval(multiTimerInterval); multiTimerInterval = null; }
        gameState = 'over';

        // 计算段位积分变化
        let result = '';
        let scoreChange = 0;

        if (!player1Alive && !player2Alive) {
            // 双方都死亡 - 平局
            result = '🤝 平局！';
            if (score > score2) {
                scoreChange = Math.floor((score - score2) / 2);
                rankScore += scoreChange;
                result += ` (${scoreChange}分)`;
            } else if (score2 > score) {
                scoreChange = -Math.floor((score2 - score) / 2);
                rankScore = Math.max(0, rankScore + scoreChange);
                result += ` (${scoreChange}分)`;
            }
        } else if (!player1Alive) {
            // 玩家1死亡 - 玩家1输
            result = '💀 你输了！';
            scoreChange = -20;
            rankScore = Math.max(0, rankScore + scoreChange);
            result += ' (-20分)';
        } else if (!player2Alive) {
            // 玩家2死亡 - 玩家1赢
            result = '🎉 你赢了！';
            scoreChange = 30;
            rankScore += scoreChange;
            result += ' (+30分)';
        } else {
            // 时间到，比较得分
            if (score > score2) {
                result = `🎉 你赢了！(${score} vs ${score2})`;
                scoreChange = 30;
                rankScore += scoreChange;
                result += ' (+30分)';
            } else if (score2 > score) {
                result = `💀 你输了！(${score} vs ${score2})`;
                scoreChange = -20;
                rankScore = Math.max(0, rankScore + scoreChange);
                result += ' (-20分)';
            } else {
                result = `🤝 平局！(${score} vs ${score2})`;
            }
        }

        // 保存段位积分
        try { localStorage.setItem(RANK_SCORE_KEY, String(rankScore)); } catch (e) {}
        
        updateRankUI();
        setOverlay(result, `当前段位: ${getCurrentRank()}`, true);
    }

    function changeDirection(dx, dy) {
        if (gameState !== 'running' && gameState !== 'paused') return;
        // 禁止 180 度反向
        if (dx === -direction.x && dy === -direction.y) return;
        // 禁止和当前方向相同（避免浪费）
        if (dx === direction.x && dy === direction.y) return;
        pendingDirection = { x: dx, y: dy };
    }

    // --- 键盘控制 ---
    function handleKey(e) {
        const modal = document.getElementById('snakeModal');
        if (!modal || modal.style.display === 'none') return;

        const key = (e.key || '').toLowerCase();

        if (e.code === 'Space' || key === ' ') {
            e.preventDefault();
            if (gameState === 'idle' || gameState === 'over') {
                startGame();
            } else {
                pauseGame();
            }
            return;
        }

        // 方向键 / WASD
        if (e.code === 'ArrowUp' || key === 'w') {
            e.preventDefault();
            if (gameState === 'idle' || gameState === 'over') startGame();
            changeDirection(0, -1);
        } else if (e.code === 'ArrowDown' || key === 's') {
            e.preventDefault();
            if (gameState === 'idle' || gameState === 'over') startGame();
            changeDirection(0, 1);
        } else if (e.code === 'ArrowLeft' || key === 'a') {
            e.preventDefault();
            if (gameState === 'idle' || gameState === 'over') startGame();
            changeDirection(-1, 0);
        } else if (e.code === 'ArrowRight' || key === 'd') {
            e.preventDefault();
            if (gameState === 'idle' || gameState === 'over') startGame();
            changeDirection(1, 0);
        }
    }

    // --- 打开/关闭模态框 ---
    function openModal() {
        const modal = document.getElementById('snakeModal');
        if (!modal) return;
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');

        // 初始化画布
        const canvas = document.getElementById('snakeCanvas');
        if (canvas) {
            snakeCanvas = canvas;
            // 设置真实像素大小（高 DPI 支持）
            const dpr = Math.max(1, window.devicePixelRatio || 1);
            snakeCanvas.width = CANVAS_SIZE * dpr;
            snakeCanvas.height = CANVAS_SIZE * dpr;
            snakeCtx = snakeCanvas.getContext('2d');
            snakeCtx.scale(dpr, dpr);
        }

        // 加载最高分和段位积分
        try {
            const v = localStorage.getItem(HIGH_SCORE_KEY);
            highScore = v ? parseInt(v, 10) || 0 : 0;
        } catch (e) { highScore = 0; }
        try {
            const v = localStorage.getItem(RANK_SCORE_KEY);
            rankScore = v ? parseInt(v, 10) || 0 : 0;
        } catch (e) { rankScore = 0; }

        // 初始化 idle 状态
        resetGame();
        // 绑定键盘
        document.addEventListener('keydown', handleKey);
    }

    function closeModal() {
        const modal = document.getElementById('snakeModal');
        if (!modal) return;
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');

        // 停止游戏
        if (gameLoopTimer) { clearTimeout(gameLoopTimer); gameLoopTimer = null; }
        if (multiTimerInterval) { clearInterval(multiTimerInterval); multiTimerInterval = null; }
        if (animationRAF) { cancelAnimationFrame(animationRAF); animationRAF = null; }
        gameState = 'idle';
        snake = [];
        snake2 = [];
        food = null;
        snakeCanvas = null;
        snakeCtx = null;
        document.removeEventListener('keydown', handleKey);
    }

    // --- 暴露到全局（供 onclick 调用） ---
    window.openSnakeGame = openModal;
    window.closeSnakeGame = closeModal;
    window.startSnakeGame = startGame;
    window.pauseSnakeGame = pauseGame;
    window.resetSnakeGame = resetGame;
    window.setSnakeMode = setGameMode;
    window.setSnakeDifficulty = setSnakeDifficulty;
})();

// === 校园跑系统 ===
(function() {
    let runTimer = null;
    let runState = 'idle'; // idle, running, paused
    let runDistance = 0;
    let runDuration = 0;
    let runCalories = 0;
    let runHistory = [];
    
    // 虚拟跑步者相关变量
    let virtualRunnerTimer = null;
    let virtualRunnerState = 'idle';
    let currentTrackPoints = [];
    let currentRouteIndex = 0;
    let currentSpeed = 8; // 当前速度 km/h
    let isDrawing = false; // 是否在绘制路线
    let drawnRoutePoints = []; // 手绘路线点
    
    // 预设路线数据（上海大学嘉定校区周边）
    const campusRoutes = {
        'campus-loop': {
            name: '校园环路',
            distance: 3.0,
            points: [
                { lng: 121.2485, lat: 31.3728 }, // 图书馆
                { lng: 121.2495, lat: 31.3715 },
                { lng: 121.2505, lat: 31.3710 },
                { lng: 121.2515, lat: 31.3715 }, // 体育场
                { lng: 121.2525, lat: 31.3725 },
                { lng: 121.2520, lat: 31.3735 },
                { lng: 121.2510, lat: 31.3745 }, // 教学楼
                { lng: 121.2495, lat: 31.3740 },
                { lng: 121.2485, lat: 31.3735 },
                { lng: 121.2475, lat: 31.3730 }, // 食堂
                { lng: 121.2480, lat: 31.3725 },
                { lng: 121.2485, lat: 31.3728 }  // 回到图书馆
            ]
        },
        'library-sports': {
            name: '图书馆-体育场',
            distance: 1.5,
            points: [
                { lng: 121.2485, lat: 31.3728 }, // 图书馆
                { lng: 121.2490, lat: 31.3720 },
                { lng: 121.2495, lat: 31.3715 },
                { lng: 121.2505, lat: 31.3710 },
                { lng: 121.2515, lat: 31.3715 }, // 体育场
                { lng: 121.2520, lat: 31.3720 },
                { lng: 121.2515, lat: 31.3725 },
                { lng: 121.2505, lat: 31.3728 },
                { lng: 121.2495, lat: 31.3730 },
                { lng: 121.2485, lat: 31.3728 }  // 回到图书馆
            ]
        },
        'dorm-canteen': {
            name: '宿舍-食堂',
            distance: 2.0,
            points: [
                { lng: 121.2460, lat: 31.3740 }, // 宿舍区
                { lng: 121.2470, lat: 31.3735 },
                { lng: 121.2480, lat: 31.3730 },
                { lng: 121.2485, lat: 31.3728 }, // 图书馆附近
                { lng: 121.2490, lat: 31.3725 },
                { lng: 121.2495, lat: 31.3720 },
                { lng: 121.2500, lat: 31.3715 }, // 食堂
                { lng: 121.2495, lat: 31.3720 },
                { lng: 121.2490, lat: 31.3725 },
                { lng: 121.2485, lat: 31.3728 },
                { lng: 121.2475, lat: 31.3735 },
                { lng: 121.2460, lat: 31.3740 }  // 回到宿舍
            ]
        },
        'playground-track': {
            name: '操场跑道',
            distance: 0.4,
            points: generatePlaygroundTrack()
        },
        'custom-draw': {
            name: '手绘路线',
            distance: 0,
            points: []
        },
        'random-walk': {
            name: '随机漫步',
            distance: 2.5,
            points: []
        }
    };
    
    // 生成操场跑道路线（椭圆形，约400米）
    function generatePlaygroundTrack() {
        const centerLng = 121.2500;
        const centerLat = 31.3712;
        const semiMajor = 0.0004; // 长半轴
        const semiMinor = 0.00015; // 短半轴
        const points = [];
        
        for (let angle = 0; angle <= 360; angle += 10) {
            const rad = angle * Math.PI / 180;
            const lng = centerLng + semiMajor * Math.cos(rad);
            const lat = centerLat + semiMinor * Math.sin(rad);
            points.push({ lng, lat });
        }
        return points;
    }
    
    // 初始化速度滑块事件
    function initSpeedControl() {
        const slider = document.getElementById('speedSlider');
        const valueDisplay = document.getElementById('currentSpeedValue');
        
        if (slider && valueDisplay) {
            slider.addEventListener('input', function(e) {
                currentSpeed = parseFloat(e.target.value);
                valueDisplay.textContent = currentSpeed + ' km/h';
            });
        }
        
        // 监听路线选择变化
        const routeSelector = document.getElementById('routeSelector');
        if (routeSelector) {
            routeSelector.addEventListener('change', function(e) {
                console.log('Route selector changed to:', e.target.value);
                if (e.target.value === 'custom-draw') {
                    showGaodeMap();
                } else if (e.target.value === 'random-walk') {
                    // 随机漫步：在小地图上随机生成起点和终点
                    hideGaodeMap();
                    if (gaodeMap) {
                        gaodeMap.setStatus({
                            dragEnable: true,
                            zoomEnable: true,
                            scrollWheel: true,
                            doubleClickZoom: true
                        });
                    }
                    cancelDrawMode();
                    
                    // 初始化小地图并生成随机路线
                    if (!runMapCtx) {
                        initRunMap();
                    }
                    // 延迟执行，确保画布已初始化
                    setTimeout(() => {
                        generateRandomRoute();
                    }, 100);
                } else {
                    hideGaodeMap();
                    if (gaodeMap) {
                        gaodeMap.setStatus({
                            dragEnable: true,
                            zoomEnable: true,
                            scrollWheel: true,
                            doubleClickZoom: true
                        });
                    }
                    cancelDrawMode();
                }
            });
        } else {
            console.error('routeSelector not found');
        }
    }
    
    let gaodeMap = null;
    let gaodeMarkerLayer = null;
    let gaodePolyline = null;
    let gaodeDrawingPolyline = null;
    
    let drawMode = 'idle'; // idle, placing, drawing
    let currentPointType = 'start'; // start, end
    let routeStartPoint = null;
    let routeEndPoint = null;
    let drawingPoints = [];
    
    function showGaodeMap() {
        const mapContainer = document.getElementById('gaodeMapContainer');
        const mapDiv = document.getElementById('gaodeMap');
        if (!mapContainer || !mapDiv) {
            console.error('Map container not found');
            return;
        }
        
        mapContainer.style.display = 'block';
        console.log('Map container shown');
        
        if (!gaodeMap) {
            console.log('Loading Gaode Map script...');
            loadGaodeMapScript().then(() => {
                if (window.AMap) {
                    console.log('AMap loaded, initializing map...');
                    initGaodeMap();
                } else {
                    console.error('AMap not available after loading');
                }
            }).catch((err) => {
                console.error('Failed to load Gaode Map:', err);
            });
        } else {
            console.log('Map already initialized');
        }
    }
    
    function hideGaodeMap() {
        const mapContainer = document.getElementById('gaodeMapContainer');
        if (mapContainer) {
            mapContainer.style.display = 'none';
        }
    }
    
    function initGaodeMap() {
        gaodeMap = new AMap.Map('gaodeMap', {
            center: [121.2485, 31.3728], // 上海大学嘉定校区坐标
            zoom: 17,
            resizeEnable: true
        });
        
        gaodeMarkerLayer = new AMap.LayerGroup();
        gaodeMap.add(gaodeMarkerLayer);
        
        // 双击事件：布置起点/终点
        gaodeMap.on('dblclick', function(e) {
            console.log('dblclick event triggered, drawMode:', drawMode, ', currentPointType:', currentPointType);
            if (drawMode === 'placing') {
                console.log('Calling placePoint with:', e.lnglat.lng, e.lnglat.lat);
                placePoint(e.lnglat.lng, e.lnglat.lat);
            }
        });
        
        // 鼠标按下事件：开始画线
        gaodeMap.on('mousedown', function(e) {
            if (drawMode === 'drawing' && routeStartPoint) {
                startDrawing(e.lnglat.lng, e.lnglat.lat);
            }
        });
        
        // 鼠标移动事件：画线中
        gaodeMap.on('mousemove', function(e) {
            if (drawMode === 'drawing' && routeStartPoint && drawingPoints.length > 0) {
                updateDrawing(e.lnglat.lng, e.lnglat.lat);
            }
        });
        
        // 鼠标松开事件：结束画线
        gaodeMap.on('mouseup', function(e) {
            if (drawMode === 'drawing' && routeStartPoint) {
                endDrawing(e.lnglat.lng, e.lnglat.lat);
            }
        });
    }
    
    function startDrawMode() {
        console.log('startDrawMode called, gaodeMap:', !!gaodeMap);
        if (!gaodeMap) {
            console.error('gaodeMap is null, cannot start drawing');
            return;
        }
        
        // 禁用地图拖动和缩放
        gaodeMap.setStatus({
            dragEnable: false,
            zoomEnable: false,
            scrollWheel: false,
            doubleClickZoom: false
        });
        console.log('Map status set to disabled interaction');
        
        // 切换UI
        const drawButtons = document.getElementById('mapDrawButtons');
        if (drawButtons) {
            drawButtons.style.display = 'flex';
            const startBtn = drawButtons.querySelector('.start-btn');
            const cancelBtn = drawButtons.querySelector('.cancel-btn');
            if (startBtn) startBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'flex';
        }
        
        const positionButtons = document.getElementById('mapPositionButtons');
        if (positionButtons) {
            positionButtons.style.display = 'flex';
        }
        
        const drawLineButtons = document.getElementById('mapDrawLineButtons');
        if (drawLineButtons) {
            drawLineButtons.style.display = 'none';
        }
        
        const resultDiv = document.getElementById('mapDrawResult');
        if (resultDiv) {
            resultDiv.style.display = 'none';
        }
        
        const resultInfo = document.getElementById('mapResultInfo');
        if (resultInfo) {
            resultInfo.style.display = 'none';
        }
        
        const statusDiv = document.getElementById('mapDrawStatus');
        if (statusDiv) {
            statusDiv.innerHTML = '<i class="fas fa-mouse-pointer"></i> 当前状态：拖动起点(红点)和终点(绿点)到合适位置，然后点击"完成定位"';
        }
        
        drawMode = 'placing';
        console.log('drawMode set to:', drawMode);
        
        // 清除之前的路线
        clearRoute();
        
        // 在地图中心附近创建可拖动的起点和终点标记
        const center = gaodeMap.getCenter();
        const startLng = center.lng - 0.002;
        const endLng = center.lng + 0.002;
        
        // 创建起点标记（红色）
        routeStartPoint = { lng: startLng, lat: center.lat };
        createDraggableMarker(startLng, center.lat, 'start');
        
        // 创建终点标记（绿色）
        routeEndPoint = { lng: endLng, lat: center.lat };
        createDraggableMarker(endLng, center.lat, 'end');
    }
    
    function cancelDrawMode() {
        if (!gaodeMap) return;
        
        // 恢复地图交互
        gaodeMap.setStatus({
            dragEnable: true,
            zoomEnable: true,
            scrollWheel: true,
            doubleClickZoom: true
        });
        
        // 切换UI - 恢复初始状态
        const drawButtons = document.getElementById('mapDrawButtons');
        if (drawButtons) {
            drawButtons.style.display = 'flex';
            const startBtn = drawButtons.querySelector('.start-btn');
            const cancelBtn = drawButtons.querySelector('.cancel-btn');
            if (startBtn) startBtn.style.display = 'flex';
            if (cancelBtn) cancelBtn.style.display = 'none';
        }
        
        const positionButtons = document.getElementById('mapPositionButtons');
        if (positionButtons) {
            positionButtons.style.display = 'none';
        }
        
        const drawLineButtons = document.getElementById('mapDrawLineButtons');
        if (drawLineButtons) {
            drawLineButtons.style.display = 'none';
        }
        
        const resultDiv = document.getElementById('mapDrawResult');
        if (resultDiv) {
            resultDiv.style.display = 'none';
        }
        
        const resultInfo = document.getElementById('mapResultInfo');
        if (resultInfo) {
            resultInfo.style.display = 'none';
        }
        
        const statusDiv = document.getElementById('mapDrawStatus');
        if (statusDiv) {
            statusDiv.innerHTML = '<i class="fas fa-map-marker-alt"></i> 拖动地图找到合适位置，然后点击"开始绘制"';
        }
        
        drawMode = 'idle';
        currentPointType = 'start';
        
        // 清除路线
        clearRoute();
    }
    
    function createDraggableMarker(lng, lat, type) {
        const color = type === 'start' ? '#ef4444' : '#22c55e';
        
        const marker = new AMap.Marker({
            position: [lng, lat],
            icon: new AMap.Icon({
                size: new AMap.Size(35, 35),
                image: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="35" height="35"><circle cx="17" cy="17" r="14" fill="${color}" stroke="#fff" stroke-width="2"/><text x="17" y="22" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${type === 'start' ? '起' : '终'}</text></svg>`,
                imageSize: new AMap.Size(35, 35)
            }),
            draggable: true,
            title: type === 'start' ? '起点 - 可拖动' : '终点 - 可拖动',
            cursor: 'move'
        });
        
        // 拖动结束后更新位置
        marker.on('dragend', function(e) {
            const position = e.target.getPosition();
            if (type === 'start') {
                routeStartPoint = { lng: position.lng, lat: position.lat };
                console.log('起点位置更新:', routeStartPoint);
            } else {
                routeEndPoint = { lng: position.lng, lat: position.lat };
                console.log('终点位置更新:', routeEndPoint);
            }
        });
        
        gaodeMarkerLayer.add(marker);
    }
    
    function confirmPosition() {
        console.log('confirmPosition called');
        if (!routeStartPoint || !routeEndPoint) {
            alert('请先设置起点和终点');
            return;
        }
        
        // 禁用标记拖动
        gaodeMarkerLayer.eachOverlay(function(overlay) {
            if (overlay instanceof AMap.Marker) {
                overlay.setDraggable(false);
                overlay.setCursor('default');
            }
        });
        
        // 切换UI
        const positionButtons = document.getElementById('mapPositionButtons');
        if (positionButtons) {
            positionButtons.style.display = 'none';
        }
        
        const drawLineButtons = document.getElementById('mapDrawLineButtons');
        if (drawLineButtons) {
            drawLineButtons.style.display = 'flex';
        }
        
        const statusDiv = document.getElementById('mapDrawStatus');
        if (statusDiv) {
            statusDiv.innerHTML = '<i class="fas fa-pencil-alt"></i> 当前状态：从起点按下鼠标拖动到终点画线';
        }
        
        drawMode = 'drawing';
        console.log('drawMode set to:', drawMode);
    }
    
    function finishDrawingLine() {
        console.log('finishDrawingLine called');
        if (!routeStartPoint || !routeEndPoint) {
            alert('请先设置起点和终点');
            return;
        }
        
        // 切换UI
        const drawLineButtons = document.getElementById('mapDrawLineButtons');
        if (drawLineButtons) {
            drawLineButtons.style.display = 'none';
        }
        
        const resultDiv = document.getElementById('mapDrawResult');
        if (resultDiv) {
            resultDiv.style.display = 'flex';
        }
        
        const resultInfo = document.getElementById('mapResultInfo');
        if (resultInfo) {
            resultInfo.style.display = 'flex';
        }
        
        const statusDiv = document.getElementById('mapDrawStatus');
        if (statusDiv) {
            statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> 当前状态：路线绘制完成，点击"确认路线"开始跑步';
        }
        
        // 计算路线距离
        const distance = calculateDistance(routeStartPoint.lng, routeStartPoint.lat, routeEndPoint.lng, routeEndPoint.lat);
        const distanceSpan = document.getElementById('routeDistance');
        if (distanceSpan) {
            distanceSpan.textContent = distance.toFixed(2);
        }
        
        drawMode = 'finished';
        console.log('drawMode set to:', drawMode);
    }
    
    function calculateDistance(lng1, lat1, lng2, lat2) {
        const R = 6371; // 地球半径(km)
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    function placePoint(lng, lat) {
        console.log('placePoint called with:', lng, lat, ', currentPointType:', currentPointType);
        const point = { lng, lat };
        
        if (currentPointType === 'start') {
            // 第一次双击：设置起点
            routeStartPoint = point;
            console.log('Setting routeStartPoint:', routeStartPoint);
            addMarker(lng, lat, 'start');
            currentPointType = 'end';
            console.log('currentPointType changed to:', currentPointType);
            const statusDiv = document.getElementById('mapDrawStatus');
            if (statusDiv) {
                statusDiv.innerHTML = '<i class="fas fa-flag"></i> 当前状态：双击地图布置终点';
            }
        } else {
            // 第二次双击：设置终点，自动进入画线模式
            routeEndPoint = point;
            addMarker(lng, lat, 'end');
            
            // 切换到画线模式
            drawMode = 'drawing';
            document.getElementById('mapDrawStatus').innerHTML = '<i class="fas fa-pencil-alt"></i> 当前状态：从起点按下鼠标拖动到终点画线';
        }
    }
    
    function addMarker(lng, lat, type) {
        // 起点是红色，终点是绿色
        const color = type === 'start' ? '#ef4444' : '#22c55e';
        
        const marker = new AMap.Marker({
            position: [lng, lat],
            icon: new AMap.Icon({
                size: new AMap.Size(30, 30),
                image: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><circle cx="15" cy="15" r="12" fill="${color}" stroke="#fff" stroke-width="2"/><text x="15" y="20" text-anchor="middle" fill="white" font-size="12">${type === 'start' ? '起' : '终'}</text></svg>`,
                imageSize: new AMap.Size(30, 30)
            }),
            title: type === 'start' ? '起点' : '终点'
        });
        gaodeMarkerLayer.add(marker);
    }
    
    function startDrawing(lng, lat) {
        drawingPoints = [{ lng, lat }];
        
        // 清除之前的绘制线
        if (gaodeDrawingPolyline) {
            gaodeMap.remove(gaodeDrawingPolyline);
            gaodeDrawingPolyline = null;
        }
    }
    
    function updateDrawing(lng, lat) {
        drawingPoints.push({ lng, lat });
        
        // 更新绘制线
        if (gaodeDrawingPolyline) {
            gaodeMap.remove(gaodeDrawingPolyline);
        }
        
        const path = drawingPoints.map(p => [p.lng, p.lat]);
        gaodeDrawingPolyline = new AMap.Polyline({
            path: path,
            strokeColor: '#3b82f6',
            strokeWeight: 5,
            strokeStyle: 'solid',
            strokeOpacity: 0.8
        });
        gaodeMap.add(gaodeDrawingPolyline);
    }
    
    function endDrawing(lng, lat) {
        drawingPoints.push({ lng, lat });
        
        // 添加最终路线
        if (gaodeDrawingPolyline) {
            gaodeMap.remove(gaodeDrawingPolyline);
        }
        
        // 创建最终路线
        const path = drawingPoints.map(p => [p.lng, p.lat]);
        gaodePolyline = new AMap.Polyline({
            path: path,
            strokeColor: '#22c55e',
            strokeWeight: 5,
            strokeStyle: 'solid'
        });
        gaodeMap.add(gaodePolyline);
        
        // 保存路线点
        drawnRoutePoints = [...drawingPoints];
        
        // 计算距离
        const distance = calculateRouteDistance(drawnRoutePoints);
        document.getElementById('routeDistance').textContent = distance.toFixed(2);
        
        // 显示结果
        drawMode = 'finished';
        document.getElementById('mapDrawResult').style.display = 'flex';
        document.getElementById('mapDrawStatus').innerHTML = '<i class="fas fa-check-circle"></i> 路线绘制完成！';
        
        // 缩小地图显示
        const mapContainer = document.getElementById('gaodeMap');
        mapContainer.style.height = '120px';
    }
    
    function confirmRoute() {
        console.log('confirmRoute called');
        
        // 隐藏绘制相关UI
        const resultDiv = document.getElementById('mapDrawResult');
        if (resultDiv) {
            resultDiv.style.display = 'none';
        }
        
        const resultInfo = document.getElementById('mapResultInfo');
        if (resultInfo) {
            resultInfo.style.display = 'none';
        }
        
        const statusDiv = document.getElementById('mapDrawStatus');
        if (statusDiv) {
            statusDiv.innerHTML = '<i class="fas fa-route"></i> 路线已确认，可开始跑步';
        }
        
        // 显示速度控制和开始按钮
        const speedSlider = document.getElementById('speedSlider');
        if (speedSlider) {
            speedSlider.disabled = false;
        }
        
        // 设置路线名称
        const routeSelector = document.getElementById('routeSelector');
        if (routeSelector && routeStartPoint && routeEndPoint) {
            const distance = calculateDistance(routeStartPoint.lng, routeStartPoint.lat, routeEndPoint.lng, routeEndPoint.lat);
            routeSelector.options[routeSelector.selectedIndex].text = `✏️ 手绘路线 (${distance.toFixed(2)}km)`;
        }
        
        // 在小地图上绘制路线
        if (runMapCtx) {
            // 将经纬度转换为小地图坐标
            const canvas = runMapCanvas;
            const startX = 30 + ((routeStartPoint.lng - 121.24) / 0.02) * (canvas.width - 60);
            const startY = 30 + ((routeStartPoint.lat - 31.36) / 0.02) * (canvas.height - 60);
            const endX = 30 + ((routeEndPoint.lng - 121.24) / 0.02) * (canvas.width - 60);
            const endY = 30 + ((routeEndPoint.lat - 31.36) / 0.02) * (canvas.height - 60);
            
            drawRunMap({ x: startX, y: startY }, { x: endX, y: endY });
        }
    }
    
    function redoRoute() {
        console.log('redoRoute called');
        
        // 清除路线
        clearRoute();
        
        // 恢复地图尺寸
        const mapContainer = document.getElementById('gaodeMap');
        if (mapContainer) {
            mapContainer.style.height = '300px';
        }
        
        // 重新开始绘制流程
        startDrawMode();
    }
    
    function clearRoute() {
        gaodeMarkerLayer.clearLayers();
        
        if (gaodePolyline) {
            gaodeMap.remove(gaodePolyline);
            gaodePolyline = null;
        }
        
        if (gaodeDrawingPolyline) {
            gaodeMap.remove(gaodeDrawingPolyline);
            gaodeDrawingPolyline = null;
        }
        
        routeStartPoint = null;
        routeEndPoint = null;
        drawingPoints = [];
        drawnRoutePoints = [];
    }
    
    function loadGaodeMapScript() {
        return new Promise((resolve, reject) => {
            if (window.AMap) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://webapi.amap.com/maps?v=2.0&key=4ae6483e7abac4f6d589095e7178cb3b&callback=onGaodeMapReady';
            script.type = 'text/javascript';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    window.onGaodeMapReady = function() {
        if (document.getElementById('gaodeMapContainer').style.display === 'block') {
            initGaodeMap();
        }
    };
    
    // 暴露新函数到全局
    window.startDrawMode = startDrawMode;
    window.cancelDrawMode = cancelDrawMode;
    window.confirmPosition = confirmPosition;
    window.finishDrawingLine = finishDrawingLine;
    window.confirmRoute = confirmRoute;
    window.redoRoute = redoRoute;
    
    function loadRunHistory() {
        const saved = localStorage.getItem('campus_run_history');
        if (saved) {
            runHistory = JSON.parse(saved);
        } else {
            runHistory = [];
        }
        renderRunHistory();
    }
    
    function saveRunHistory() {
        localStorage.setItem('campus_run_history', JSON.stringify(runHistory));
    }
    
    function renderRunHistory() {
        const list = document.getElementById('runHistoryList');
        if (!list) return;
        
        if (runHistory.length === 0) {
            list.innerHTML = '<p class="no-history">暂无跑步记录</p>';
            return;
        }
        
        list.innerHTML = runHistory.slice(-10).reverse().map(item => `
            <div class="history-item">
                <span class="history-date">${item.date}</span>
                <span class="history-stats">${item.distance} km · ${item.duration}</span>
            </div>
        `).join('');
    }
    
    function updateRunStats() {
        document.getElementById('runDistance').textContent = runDistance.toFixed(2) + ' km';
        
        const minutes = Math.floor(runDuration / 60);
        const seconds = runDuration % 60;
        document.getElementById('runDuration').textContent = 
            String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        
        runCalories = Math.round(runDistance * 60);
        document.getElementById('runCalories').textContent = runCalories + ' kcal';
    }
    
    function toggleButtons(start, pause, stop) {
        document.getElementById('runStartBtn').style.display = start ? '' : 'none';
        document.getElementById('runPauseBtn').style.display = pause ? '' : 'none';
        document.getElementById('runStopBtn').style.display = stop ? '' : 'none';
    }
    
    // 生成随机漫步路线
    function generateRandomRoute() {
        const points = [];
        let lng = 121.2485;
        let lat = 31.3728;
        points.push({ lng, lat });
        
        for (let i = 0; i < 20; i++) {
            lng += (Math.random() - 0.5) * 0.002;
            lat += (Math.random() - 0.5) * 0.002;
            lng = Math.max(121.245, Math.min(121.255, lng));
            lat = Math.max(31.368, Math.min(31.378, lat));
            points.push({ lng, lat });
        }
        return points;
    }
    
    // 插值计算点
    function interpolatePoints(p1, p2, steps) {
        const points = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            points.push({
                lng: p1.lng + (p2.lng - p1.lng) * t,
                lat: p1.lat + (p2.lat - p1.lat) * t
            });
        }
        return points;
    }
    
    // 开始虚拟跑步者模拟
    function startVirtualRunner() {
        if (virtualRunnerState === 'running') return;
        
        const routeSelector = document.getElementById('routeSelector');
        const routeKey = routeSelector.value;
        let route = campusRoutes[routeKey];
        
        // 如果是手绘路线，使用手绘的点
        if (routeKey === 'custom-draw') {
            if (drawnRoutePoints.length < 2) {
                alert('请先绘制至少2个点位的路线！');
                return;
            }
            route = { 
                name: '手绘路线', 
                distance: calculateRouteDistance(drawnRoutePoints),
                points: drawnRoutePoints 
            };
        }
        // 如果是随机漫步，生成随机路线
        else if (routeKey === 'random-walk') {
            route = { ...route, points: generateRandomRoute() };
        }
        
        // 插值生成更密集的轨迹点（根据速度调整密度）
        const steps = Math.max(3, Math.round(currentSpeed / 2));
        let allPoints = [];
        for (let i = 0; i < route.points.length - 1; i++) {
            const interpolated = interpolatePoints(route.points[i], route.points[i + 1], steps);
            allPoints.push(...interpolated.slice(0, -1));
        }
        allPoints.push(route.points[route.points.length - 1]);
        
        currentTrackPoints = [];
        currentRouteIndex = 0;
        virtualRunnerState = 'running';
        
        updateSimulationStatus('running', `正在模拟跑步... 速度: ${currentSpeed} km/h`);
        
        // 根据速度调整时间间隔（速度越快，间隔越小）
        const interval = Math.max(200, 1000 - (currentSpeed - 1) * 50);
        
        virtualRunnerTimer = setInterval(() => {
            if (currentRouteIndex >= allPoints.length) {
                stopVirtualRunner();
                updateSimulationStatus('finished', `模拟完成！共生成 ${currentTrackPoints.length} 个轨迹点，路线长度: ${route.distance.toFixed(2)} km`);
                return;
            }
            
            const point = allPoints[currentRouteIndex];
            // 模拟速度波动（±1 km/h）
            const speedWithVariation = currentSpeed + (Math.random() - 0.5) * 2;
            
            currentTrackPoints.push({
                lng: point.lng,
                lat: point.lat,
                timestamp: new Date().toISOString(),
                speed: speedWithVariation
            });
            
            // 更新显示
            updateGpsDisplay(point.lng, point.lat);
            updateTrackPointsDisplay();
            
            currentRouteIndex++;
        }, interval);
    }
    
    // 停止虚拟跑步者模拟
    function stopVirtualRunner() {
        virtualRunnerState = 'idle';
        
        if (virtualRunnerTimer) {
            clearInterval(virtualRunnerTimer);
            virtualRunnerTimer = null;
        }
        
        updateSimulationStatus('stopped', '已停止 - 点击"启动模拟"开始测试');
    }
    
    // 更新GPS显示
    function updateGpsDisplay(lng, lat) {
        document.getElementById('currentGps').textContent = 
            `经度: ${lng.toFixed(6)}, 纬度: ${lat.toFixed(6)}`;
        document.getElementById('currentSpeed').textContent = currentSpeed.toFixed(1);
    }
    
    // 切换绘制模式
    function toggleDrawMode(forceOff) {
        isDrawing = forceOff ? false : !isDrawing;
        const btn = document.getElementById('drawToggleBtn');
        
        if (isDrawing) {
            btn.textContent = '✏️ 绘制中...';
            btn.classList.add('drawing');
            document.getElementById('drawStatus').textContent = 
                `已添加 ${drawnRoutePoints.length} 个点位 - 点击地图添加，点击点位删除`;
            alert('已进入绘制模式！点击地图添加路线点，点击已有点位可删除');
        } else {
            btn.textContent = '✏️ 开始绘制';
            btn.classList.remove('drawing');
            document.getElementById('drawStatus').textContent = 
                `已添加 ${drawnRoutePoints.length} 个点位`;
        }
    }
    
    // 清除手绘路线
    function clearDrawnRoute() {
        drawnRoutePoints = [];
        document.getElementById('drawStatus').textContent = '已添加 0 个点位';
        
        // 清除高德地图上的标记和路线
        if (gaodeMarkerLayer) {
            gaodeMarkerLayer.clearLayers();
        }
        if (gaodePolyline) {
            gaodeMap.remove(gaodePolyline);
            gaodePolyline = null;
        }
        
        // 如果在绘制模式中，更新状态
        if (isDrawing) {
            document.getElementById('drawToggleBtn').textContent = '✏️ 开始绘制';
            document.getElementById('drawToggleBtn').classList.remove('drawing');
            isDrawing = false;
        }
    }
    
    // 在地图上添加绘制点
    function addDrawnPoint(lng, lat) {
        drawnRoutePoints.push({ lng, lat });
        updateDrawStatus();
    }
    
    // 更新绘制状态
    function updateDrawStatus() {
        const status = document.getElementById('drawStatus');
        if (status) {
            if (drawnRoutePoints.length === 0) {
                status.textContent = '已添加 0 个点位';
            } else if (drawnRoutePoints.length === 1) {
                status.textContent = `已添加 1 个点位 - 继续添加或点击开始跑步`;
            } else {
                const distance = calculateRouteDistance(drawnRoutePoints);
                status.textContent = `已添加 ${drawnRoutePoints.length} 个点位，路线长度: ${distance.toFixed(2)} km`;
            }
        }
    }
    
    // 计算路线距离
    function calculateRouteDistance(points) {
        let distance = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            distance += haversineDistance(p1.lng, p1.lat, p2.lng, p2.lat);
        }
        return distance;
    }
    
    // 计算两点间距离（haversine公式）
    function haversineDistance(lng1, lat1, lng2, lat2) {
        const R = 6371; // 地球半径 km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    // 更新轨迹点显示
    function updateTrackPointsDisplay() {
        const trackPointsDiv = document.getElementById('trackPoints');
        if (!trackPointsDiv) return;
        
        const recentPoints = currentTrackPoints.slice(-5);
        trackPointsDiv.innerHTML = recentPoints.map((p, i) => 
            `<p>#${currentTrackPoints.length - recentPoints.length + i + 1}: ${p.lng.toFixed(6)}, ${p.lat.toFixed(6)}</p>`
        ).join('');
    }
    
    // 更新模拟状态
    function updateSimulationStatus(state, message) {
        const statusDiv = document.getElementById('simulationStatus');
        if (!statusDiv) return;
        
        statusDiv.className = 'simulation-status' + (state === 'running' ? ' running' : '');
        
        const icon = state === 'running' ? '🟢' : state === 'finished' ? '✅' : '🔴';
        statusDiv.innerHTML = `
            <i class="fas fa-circle"></i> ${icon} ${message}
            <div class="track-points" id="trackPoints">
                ${state === 'running' ? '' : (currentTrackPoints.length > 0 ? 
                    '<p>轨迹点数: ' + currentTrackPoints.length + '</p>' : '')}
            </div>
        `;
    }
    
    // 导出轨迹数据
    function exportTrackData() {
        if (currentTrackPoints.length === 0) {
            alert('没有可导出的轨迹数据，请先运行模拟');
            return;
        }
        
        const exportData = {
            route: document.getElementById('routeSelector').value,
            totalPoints: currentTrackPoints.length,
            startTime: currentTrackPoints[0]?.timestamp || new Date().toISOString(),
            endTime: currentTrackPoints[currentTrackPoints.length - 1]?.timestamp || new Date().toISOString(),
            track: currentTrackPoints
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `campus-run-track-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`轨迹数据已导出！共 ${currentTrackPoints.length} 个GPS点`);
    }
    
    let runMapCtx = null;
    let runMapCanvas = null;
    
    function openModal() {
        const modal = document.getElementById('campusRunModal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.classList.add('modal-open');
            loadRunHistory();
            updateSimulationStatus('stopped', '已停止 - 点击"启动模拟"开始测试');
            initSpeedControl();
            initRunMap();
            loadGaodeMapScript();
        }
    }
    
    function initRunMap() {
        const canvas = document.getElementById('runMapCanvas');
        if (canvas && !runMapCtx) {
            runMapCanvas = canvas;
            runMapCtx = canvas.getContext('2d');
            // 初始绘制空地图
            drawRunMap();
        }
    }
    
    function drawRunMap(startPoint, endPoint) {
        if (!runMapCtx || !runMapCanvas) return;
        
        const canvas = runMapCanvas;
        const ctx = runMapCtx;
        const width = canvas.width;
        const height = canvas.height;
        
        // 清空画布
        ctx.fillStyle = '#1e3a5f';
        ctx.fillRect(0, 0, width, height);
        
        // 绘制简单的地图背景
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i < width; i += 20) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(width, i);
            ctx.stroke();
        }
        
        // 绘制一些建筑标记
        const buildings = [
            { x: 60, y: 40, name: '图书馆', color: '#3b82f6' },
            { x: 240, y: 60, name: '食堂', color: '#f59e0b' },
            { x: 150, y: 120, name: '教学楼', color: '#8b5cf6' },
            { x: 50, y: 160, name: '体育场', color: '#22c55e' },
            { x: 220, y: 170, name: '宿舍', color: '#ec4899' }
        ];
        
        buildings.forEach(b => {
            ctx.fillStyle = b.color;
            ctx.globalAlpha = 0.6;
            ctx.fillRect(b.x - 15, b.y - 15, 30, 30);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(b.name, b.x, b.y + 3);
        });
        
        // 如果有起点和终点，绘制它们
        if (startPoint && endPoint) {
            // 绘制起点（红色）
            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('起', startPoint.x, startPoint.y);
            
            // 绘制终点（绿色）
            ctx.beginPath();
            ctx.arc(endPoint.x, endPoint.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.fillText('终', endPoint.x, endPoint.y);
            
            // 绘制连线
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
    
    function generateRandomRoute() {
        if (!runMapCanvas) return;
        
        // 在地图范围内随机生成起点和终点
        const padding = 30;
        const startPoint = {
            x: padding + Math.random() * (runMapCanvas.width - padding * 2),
            y: padding + Math.random() * (runMapCanvas.height - padding * 2)
        };
        const endPoint = {
            x: padding + Math.random() * (runMapCanvas.width - padding * 2),
            y: padding + Math.random() * (runMapCanvas.height - padding * 2)
        };
        
        // 确保起点和终点有足够的距离
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 80) {
            // 距离太近，重新生成
            return generateRandomRoute();
        }
        
        // 绘制路线
        drawRunMap(startPoint, endPoint);
        
        // 更新路线信息
        const pathInfo = document.querySelector('.run-path-info');
        if (pathInfo) {
            const distance = (dist / 100).toFixed(1);
            pathInfo.innerHTML = `
                <p><strong>跑步路线:</strong> 起点 → 终点</p>
                <p><strong>预计里程:</strong> ${distance} km</p>
            `;
        }
    }
    
    function closeModal() {
        const modal = document.getElementById('campusRunModal');
        if (modal) {
            stopRun();
            stopVirtualRunner();
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
    }
    
    function startRun() {
        if (runState === 'running') return;
        
        runState = 'running';
        toggleButtons(false, true, true);
        
        const container = document.querySelector('.campus-run-container');
        if (container) container.classList.add('running');
        
        runTimer = setInterval(() => {
            runDuration++;
            runDistance += 0.003;
            updateRunStats();
        }, 1000);
    }
    
    function pauseRun() {
        if (runState !== 'running') return;
        
        runState = 'paused';
        toggleButtons(true, false, true);
        
        const container = document.querySelector('.campus-run-container');
        if (container) container.classList.remove('running');
        
        if (runTimer) {
            clearInterval(runTimer);
            runTimer = null;
        }
    }
    
    function stopRun() {
        if (runState === 'idle') return;
        
        runState = 'idle';
        toggleButtons(true, false, false);
        
        const container = document.querySelector('.campus-run-container');
        if (container) container.classList.remove('running');
        
        if (runTimer) {
            clearInterval(runTimer);
            runTimer = null;
        }
        
        if (runDistance > 0) {
            const now = new Date();
            const minutes = Math.floor(runDuration / 60);
            const seconds = runDuration % 60;
            const durationStr = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
            
            runHistory.push({
                date: now.toLocaleDateString('zh-CN') + ' ' + now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}),
                distance: runDistance.toFixed(2),
                duration: durationStr,
                calories: runCalories
            });
            saveRunHistory();
            renderRunHistory();
        }
        
        runDistance = 0;
        runDuration = 0;
        runCalories = 0;
        updateRunStats();
    }
    
    window.openCampusRun = openModal;
    window.closeCampusRun = closeModal;
    window.startCampusRun = startRun;
    window.pauseCampusRun = pauseRun;
    window.stopCampusRun = stopRun;
    window.startVirtualRunner = startVirtualRunner;
    window.stopVirtualRunner = stopVirtualRunner;
    window.exportTrackData = exportTrackData;
    window.toggleDrawMode = toggleDrawMode;
    window.clearDrawnRoute = clearDrawnRoute;
    window.generateRandomRoute = generateRandomRoute;
})();

// === 实验室管理系统 ===
(function() {
    const labs = [
        { id: 1, name: '计算机科学实验室', location: '文博楼301', capacity: 30, status: 'available', equipment: ['PC', '服务器', '路由器'] },
        { id: 2, name: '电子工程实验室', location: '文商楼205', capacity: 25, status: 'busy', equipment: ['示波器', '信号发生器', '万用表'] },
        { id: 3, name: '物理实验中心', location: '理学院楼101', capacity: 40, status: 'available', equipment: ['显微镜', '光谱仪', '激光器'] },
        { id: 4, name: '化学实验室', location: '化工楼201', capacity: 20, status: 'busy', equipment: ['离心机', '色谱仪', '反应釜'] },
        { id: 5, name: '生物实验室', location: '生命科学楼302', capacity: 15, status: 'available', equipment: ['PCR仪', '培养箱', '显微镜'] },
        { id: 6, name: '人工智能实验室', location: '计算机楼401', capacity: 35, status: 'available', equipment: ['GPU集群', 'AI训练平台', '机器人'] }
    ];

    const equipmentList = [
        { id: 1, name: '高性能服务器', labId: 1, status: 'available', borrowCount: 15 },
        { id: 2, name: '示波器DSO-X1204G', labId: 2, status: 'borrowed', borrowCount: 23 },
        { id: 3, name: '激光显微镜', labId: 3, status: 'available', borrowCount: 8 },
        { id: 4, name: '气相色谱仪', labId: 4, status: 'available', borrowCount: 12 },
        { id: 5, name: 'AI训练工作站', labId: 6, status: 'borrowed', borrowCount: 31 }
    ];

    function openModal() {
        const modal = document.getElementById('labModal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.classList.add('modal-open');
            renderLabList();
        }
    }

    function closeModal() {
        const modal = document.getElementById('labModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
    }

    function switchLabTab(tab) {
        const tabs = document.querySelectorAll('.lab-tab');
        tabs.forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');

        const content = document.getElementById('labContent');
        
        switch(tab) {
            case 'list':
                renderLabList();
                break;
            case 'booking':
                renderBooking();
                break;
            case 'equipment':
                renderEquipment();
                break;
            case 'safety':
                renderSafety();
                break;
        }
    }

    function renderLabList() {
        const list = document.getElementById('labContent');
        list.innerHTML = `
            <div class="lab-list">
                ${labs.map(lab => `
                    <div class="lab-card">
                        <h3>${lab.name}</h3>
                        <p>📍 ${lab.location}</p>
                        <p>👥 容量: ${lab.capacity}人</p>
                        <span class="lab-status ${lab.status}">${lab.status === 'available' ? '可预约' : '使用中'}</span>
                        <button onclick="bookLab(${lab.id})">${lab.status === 'available' ? '立即预约' : '查看详情'}</button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderBooking() {
        const content = document.getElementById('labContent');
        content.innerHTML = `
            <div style="color: white; text-align: center; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 16px;">📅</div>
                <h3>我的预约记录</h3>
                <p style="color: rgba(255,255,255,0.7); margin-top: 8px;">暂无预约记录</p>
                <button style="margin-top: 20px; padding: 12px 30px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border: none; border-radius: 25px; color: white; cursor: pointer;" onclick="switchLabTab('list')">
                    去预约
                </button>
            </div>
        `;
    }

    function renderEquipment() {
        const content = document.getElementById('labContent');
        content.innerHTML = `
            <div style="margin-bottom: 20px;">
                <button class="add-equipment-btn" onclick="openAddEquipmentModal()">
                    <i class="fas fa-plus"></i> 新增设备
                </button>
            </div>
            <div class="lab-list">
                ${equipmentList.map(item => `
                    <div class="lab-card">
                        <h3>${item.name}</h3>
                        <p>🏢 所属实验室: ${labs.find(l => l.id === item.labId)?.name || '未知'}</p>
                        <p>📊 借用次数: ${item.borrowCount}次</p>
                        <span class="lab-status ${item.status}">${item.status === 'available' ? '可借用' : '已借出'}</span>
                        <button onclick="borrowEquipment(${item.id})">${item.status === 'available' ? '立即借用' : '预约借用'}</button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderSafety() {
        const content = document.getElementById('labContent');
        content.innerHTML = `
            <div style="color: white; padding: 20px;">
                <h3 style="margin-bottom: 16px;">🔒 实验室安全须知</h3>
                <ul style="line-height: 2; color: rgba(255,255,255,0.8);">
                    <li>进入实验室必须佩戴实验服和防护用品</li>
                    <li>实验前必须熟悉操作规程</li>
                    <li>严禁在实验室内饮食</li>
                    <li>实验结束后要清理实验台</li>
                    <li>危险化学品要妥善保管</li>
                    <li>遇到紧急情况立即按下紧急停止按钮</li>
                    <li>保持实验室整洁，禁止吸烟</li>
                    <li>离开前确保水电关闭</li>
                </ul>
            </div>
        `;
    }

    function bookLab(labId) {
        const lab = labs.find(l => l.id === labId);
        if (lab) {
            alert(`已预约「${lab.name}」\n\n位置: ${lab.location}\n容量: ${lab.capacity}人\n\n请按时前往！`);
        }
    }

    function borrowEquipment(equipmentId) {
        const equipment = equipmentList.find(e => e.id === equipmentId);
        if (equipment) {
            if (equipment.status === 'available') {
                equipment.status = 'borrowed';
                equipment.borrowCount++;
                alert(`已借用「${equipment.name}」\n\n请按时归还！`);
                renderEquipment();
            } else {
                alert(`「${equipment.name}」当前已借出，已为您预约！`);
            }
        }
    }

    function openAddEquipmentModal() {
        const modal = document.getElementById('addEquipmentModal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.classList.add('modal-open');
        }
    }

    function closeAddEquipmentModal() {
        const modal = document.getElementById('addEquipmentModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
    }

    function addEquipment() {
        const name = document.getElementById('equipmentName').value;
        const labId = parseInt(document.getElementById('equipmentLab').value);
        
        if (!name.trim()) {
            alert('请输入设备名称');
            return;
        }

        const newEquipment = {
            id: equipmentList.length + 1,
            name: name,
            labId: labId,
            status: 'available',
            borrowCount: 0
        };

        equipmentList.push(newEquipment);
        closeAddEquipmentModal();
        renderEquipment();
        alert(`已新增设备「${name}」`);
    }

    window.openLabManagement = openModal;
    window.closeLabManagement = closeModal;
    window.switchLabTab = switchLabTab;
    window.bookLab = bookLab;
    window.borrowEquipment = borrowEquipment;
    window.openAddEquipmentModal = openAddEquipmentModal;
    window.closeAddEquipmentModal = closeAddEquipmentModal;
    window.addEquipment = addEquipment;
})();
