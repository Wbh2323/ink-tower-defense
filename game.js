// ============================================================
//  墨韵守关 - 水墨国风汉字塔防  game.js
// ============================================================

(function () {
    'use strict';

    // ---------- 全局错误捕获 ----------
    window.addEventListener('error', function(e) {
        console.error('Game Error:', e.message, e.filename, e.lineno);
    });
    window.addEventListener('unhandledrejection', function(e) {
        console.error('Unhandled Promise Rejection:', e.reason);
    });

    // ---------- Canvas & Context ----------
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // ---------- 常量 ----------
    const COLS = 14;
    const ROWS = 10;
    const TOTAL_WAVES = 10;
    const HP_MULT = 0.7;       // 怪物血量系数（降低30%）
    const COST_MULT = 0.8;     // 造价系数（降低20%）

    let CELL = 60;             // 格子像素大小（动态计算）
    let offsetX = 0, offsetY = 0; // canvas绘制偏移

    // ---------- 游戏状态 ----------
    let gold = 200;
    let baseHP = 20;
    let currentWave = 0;
    let kills = 0;
    let gameSpeed = 1;
    let paused = false;
    let gameOver = false;
    let autoWave = false;
    let waveActive = false;
    let waveTimer = 0;
    let spawnQueue = [];
    let spawnTimer = 0;
    let selectedTowerType = null;
    let selectedTower = null;
    let hoverCell = null;

    // ---------- 集合 ----------
    let towers = [];
    let enemies = [];
    let projectiles = [];
    let particles = [];
    let floatingTexts = [];
    let lightnings = [];

    // ---------- 羁绊状态 ----------
    let activeSynergies = {};

    // ============================================================
    //  S形路径定义（网格坐标）
    // ============================================================
    const PATH_POINTS = [
        { c: -1, r: 0 }, { c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 },
        { c: 3, r: 0 }, { c: 4, r: 0 }, { c: 5, r: 0 }, { c: 6, r: 0 },
        { c: 7, r: 0 }, { c: 7, r: 1 }, { c: 7, r: 2 }, { c: 7, r: 3 },
        { c: 7, r: 4 }, { c: 6, r: 4 }, { c: 5, r: 4 }, { c: 4, r: 4 },
        { c: 3, r: 4 }, { c: 2, r: 4 }, { c: 1, r: 4 }, { c: 0, r: 4 },
        { c: 0, r: 5 }, { c: 0, r: 6 }, { c: 0, r: 7 }, { c: 0, r: 8 },
        { c: 1, r: 8 }, { c: 2, r: 8 }, { c: 3, r: 8 }, { c: 4, r: 8 },
        { c: 5, r: 8 }, { c: 6, r: 8 }, { c: 7, r: 8 }, { c: 7, r: 9 },
        { c: 8, r: 9 }, { c: 9, r: 9 }, { c: 10, r: 9 }, { c: 11, r: 9 },
        { c: 12, r: 9 }, { c: 13, r: 9 }, { c: 14, r: 9 }
    ];

    // 构建路径格子集合
    const pathSet = new Set();
    PATH_POINTS.forEach(p => {
        if (p.c >= 0 && p.c < COLS && p.r >= 0 && p.r < ROWS) {
            pathSet.add(p.c + ',' + p.r);
        }
    });

    // 像素路径（用于敌人行走）
    let pixelPath = [];

    function buildPixelPath() {
        pixelPath = PATH_POINTS.map(p => ({
            x: (p.c + 0.5) * CELL + offsetX,
            y: (p.r + 0.5) * CELL + offsetY
        }));
    }

    // ============================================================
    //  防御塔定义
    // ============================================================
    const TOWER_DEFS = {
        '刀': { cost: 40, damage: 35, range: 2.2, fireRate: 1.0, color: '#d4a040', type: 'single', desc: '单体高伤' },
        '弓': { cost: 48, damage: 18, range: 3.5, fireRate: 0.7, color: '#80c0a0', type: 'pierce', pierce: 3, desc: '远程穿刺' },
        '盾': { cost: 56, damage: 8, range: 2.0, fireRate: 0.5, color: '#7090c0', type: 'slow', slowFactor: 0.4, slowDur: 2.0, desc: '范围减速' },
        '火': { cost: 80, damage: 22, range: 2.0, fireRate: 0.8, color: '#e06030', type: 'aoe', aoeRadius: 1.2, desc: '范围群伤' },
        '水': { cost: 72, damage: 12, range: 2.5, fireRate: 0.6, color: '#4090d0', type: 'dot', dotDmg: 5, dotDur: 3.0, desc: '持续腐蚀' },
        '雷': { cost: 96, damage: 20, range: 2.8, fireRate: 0.9, color: '#c0b0ff', type: 'chain', chainCount: 3, chainRange: 2.0, desc: '连锁闪电' },
        '剑': { cost: 80, damage: 15, range: 2.0, fireRate: 1.8, color: '#e0d080', type: 'rapid', desc: '快速连击' },
        '影': { cost: 80, damage: 25, range: 3.0, fireRate: 0.6, color: '#9070b0', type: 'ghost', desc: '暗影穿透' }
    };

    // 偏旁映射
    const RADICAL_MAP = {
        '水': '氵', '火': '灬',
        '刀': '刂', '剑': '刂', '影': '彡',
        '弓': '弓', '盾': '盾', '雷': '雨'
    };

    // ============================================================
    //  敌人定义
    // ============================================================
    const ENEMY_DEFS = {
        '卒': { hp: 60, speed: 1.0, reward: 10, color: '#a0a090', size: 0.5 },
        '兵': { hp: 100, speed: 1.1, reward: 15, color: '#b0a070', size: 0.55 },
        '寇': { hp: 160, speed: 1.3, reward: 22, color: '#c08060', size: 0.6 },
        '兽': { hp: 250, speed: 0.8, reward: 30, color: '#806040', size: 0.7 },
        '妖': { hp: 200, speed: 1.8, reward: 35, color: '#b050a0', size: 0.55 },
        '酋': { hp: 600, speed: 0.9, reward: 300, color: '#d04040', size: 0.8 },
        '魔王': { hp: 2000, speed: 0.6, reward: 500, color: '#ff2020', size: 1.0 }
    };

    // ============================================================
    //  波次定义
    // ============================================================
    const WAVE_DEFS = [
        [{ type: '卒', count: 8, interval: 0.8 }],
        [{ type: '卒', count: 6, interval: 0.7 }, { type: '兵', count: 4, interval: 0.8 }],
        [{ type: '兵', count: 8, interval: 0.7 }, { type: '寇', count: 3, interval: 1.0 }],
        [{ type: '寇', count: 6, interval: 0.6 }, { type: '兽', count: 2, interval: 1.2 }],
        [{ type: '兵', count: 10, interval: 0.5 }, { type: '妖', count: 3, interval: 0.8 }],
        [{ type: '兽', count: 4, interval: 0.8 }, { type: '寇', count: 8, interval: 0.5 }, { type: '妖', count: 4, interval: 0.7 }],
        [{ type: '妖', count: 6, interval: 0.5 }, { type: '兽', count: 5, interval: 0.6 }],
        [{ type: '寇', count: 12, interval: 0.4 }, { type: '妖', count: 6, interval: 0.5 }, { type: '兽', count: 3, interval: 0.8 }],
        [{ type: '兽', count: 8, interval: 0.5 }, { type: '妖', count: 8, interval: 0.4 }, { type: '酋', count: 2, interval: 1.5 }],
        [{ type: '酋', count: 4, interval: 1.0 }, { type: '妖', count: 10, interval: 0.3 }, { type: '魔王', count: 1, interval: 3.0 }]
    ];

    // ============================================================
    //  云雾背景
    // ============================================================
    let clouds = [];
    function initClouds() {
        clouds = [];
        for (let i = 0; i < 8; i++) {
            clouds.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: 80 + Math.random() * 120,
                speed: 0.15 + Math.random() * 0.3,
                alpha: 0.03 + Math.random() * 0.05
            });
        }
    }
    function updateClouds(dt) {
        clouds.forEach(c => {
            c.x += c.speed * dt * 30;
            if (c.x - c.r > canvas.width) c.x = -c.r;
        });
    }
    function drawClouds() {
        clouds.forEach(c => {
            const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
            grad.addColorStop(0, `rgba(200,190,170,${c.alpha})`);
            grad.addColorStop(1, 'rgba(200,190,170,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
        });
    }

    // ============================================================
    //  山水背景
    // ============================================================
    function drawBackground() {
        // 底色
        ctx.fillStyle = '#2a2520';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 淡墨山水
        ctx.save();
        ctx.globalAlpha = 0.08;
        // 远山
        ctx.beginPath();
        ctx.moveTo(0, canvas.height * 0.3);
        for (let x = 0; x <= canvas.width; x += 30) {
            ctx.lineTo(x, canvas.height * 0.3 + Math.sin(x * 0.008) * 40 + Math.sin(x * 0.003) * 60);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();
        ctx.fillStyle = '#808070';
        ctx.fill();

        // 近山
        ctx.beginPath();
        ctx.moveTo(0, canvas.height * 0.5);
        for (let x = 0; x <= canvas.width; x += 20) {
            ctx.lineTo(x, canvas.height * 0.5 + Math.sin(x * 0.012 + 1) * 30 + Math.sin(x * 0.005 + 2) * 40);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.closePath();
        ctx.fillStyle = '#606050';
        ctx.fill();
        ctx.restore();
    }

    // ============================================================
    //  网格绘制
    // ============================================================
    function drawGrid() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = c * CELL + offsetX;
                const y = r * CELL + offsetY;
                const key = c + ',' + r;

                if (pathSet.has(key)) {
                    // 路径格子
                    ctx.fillStyle = 'rgba(100, 90, 75, 0.35)';
                    ctx.fillRect(x, y, CELL, CELL);
                    ctx.strokeStyle = 'rgba(120, 110, 90, 0.2)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(x, y, CELL, CELL);
                } else {
                    // 空地格子 - 高亮可造塔
                    ctx.fillStyle = 'rgba(50, 45, 35, 0.3)';
                    ctx.fillRect(x, y, CELL, CELL);
                    ctx.strokeStyle = 'rgba(180, 160, 120, 0.12)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(x, y, CELL, CELL);

                    // 悬停高亮
                    if (hoverCell && hoverCell.c === c && hoverCell.r === r && selectedTowerType && !getTowerAt(c, r)) {
                        ctx.fillStyle = 'rgba(200, 180, 100, 0.15)';
                        ctx.fillRect(x, y, CELL, CELL);
                        ctx.strokeStyle = 'rgba(200, 180, 100, 0.4)';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x, y, CELL, CELL);
                    }
                }
            }
        }

        // 起点标记
        const sp = PATH_POINTS[1];
        ctx.fillStyle = 'rgba(100, 200, 100, 0.3)';
        ctx.fillRect(sp.c * CELL + offsetX, sp.r * CELL + offsetY, CELL, CELL);
        ctx.font = `${CELL * 0.4}px 'Ma Shan Zheng'`;
        ctx.fillStyle = 'rgba(150, 220, 150, 0.6)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('入', sp.c * CELL + CELL / 2 + offsetX, sp.r * CELL + CELL / 2 + offsetY);

        // 终点标记
        const ep = PATH_POINTS[PATH_POINTS.length - 2];
        ctx.fillStyle = 'rgba(200, 80, 80, 0.3)';
        ctx.fillRect(ep.c * CELL + offsetX, ep.r * CELL + offsetY, CELL, CELL);
        ctx.fillStyle = 'rgba(220, 120, 120, 0.6)';
        ctx.fillText('关', ep.c * CELL + CELL / 2 + offsetX, ep.r * CELL + CELL / 2 + offsetY);
    }

    // ============================================================
    //  塔相关
    // ============================================================
    function getTowerAt(c, r) {
        return towers.find(t => t.col === c && t.row === r);
    }

    function canPlace(c, r) {
        return c >= 0 && c < COLS && r >= 0 && r < ROWS && !pathSet.has(c + ',' + r) && !getTowerAt(c, r);
    }

    function createTower(type, col, row) {
        const def = TOWER_DEFS[type];
        const cost = Math.floor(def.cost * COST_MULT);
        if (gold < cost) return false;
        if (!canPlace(col, row)) return false;

        gold -= cost;
        const tower = {
            type: type,
            col: col,
            row: row,
            x: (col + 0.5) * CELL + offsetX,
            y: (row + 0.5) * CELL + offsetY,
            level: 1,
            damage: def.damage,
            range: def.range,
            fireRate: def.fireRate,
            color: def.color,
            attackType: def.type,
            cooldown: 0,
            totalCost: cost,
            angle: 0,
            // 特殊属性
            pierce: def.pierce || 0,
            slowFactor: def.slowFactor || 0,
            slowDur: def.slowDur || 0,
            aoeRadius: def.aoeRadius || 0,
            dotDmg: def.dotDmg || 0,
            dotDur: def.dotDur || 0,
            chainCount: def.chainCount || 0,
            chainRange: def.chainRange || 0,
            // 动画
            pulsePhase: Math.random() * Math.PI * 2
        };
        towers.push(tower);
        checkSynergies();
        return true;
    }

    function upgradeTower(tower) {
        if (tower.level >= 3) return false;
        const def = TOWER_DEFS[tower.type];
        const cost = Math.floor(def.cost * COST_MULT * tower.level * 0.8);
        if (gold < cost) return false;
        gold -= cost;
        tower.level++;
        tower.totalCost += cost;
        tower.damage = Math.floor(tower.damage * 1.4);
        tower.range += 0.2;
        tower.fireRate *= 1.15;
        return true;
    }

    function sellTower(tower) {
        const refund = Math.floor(tower.totalCost * 0.6);
        gold += refund;
        towers = towers.filter(t => t !== tower);
        selectedTower = null;
        checkSynergies();
        updateUI();
    }

    function drawTowers(time) {
        towers.forEach(t => {
            const def = TOWER_DEFS[t.type];
            const pulse = 1 + Math.sin(time * 3 + t.pulsePhase) * 0.05;
            const fontSize = CELL * 0.55 * pulse;

            // 选中高亮
            if (selectedTower === t) {
                ctx.strokeStyle = 'rgba(212, 168, 64, 0.6)';
                ctx.lineWidth = 2;
                ctx.strokeRect(t.col * CELL + offsetX + 1, t.row * CELL + offsetY + 1, CELL - 2, CELL - 2);
                // 范围圈
                ctx.beginPath();
                ctx.arc(t.x, t.y, t.range * CELL, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(212, 168, 64, 0.25)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // 塔底光晕
            const glow = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, CELL * 0.4);
            glow.addColorStop(0, t.color + '30');
            glow.addColorStop(1, t.color + '00');
            ctx.fillStyle = glow;
            ctx.fillRect(t.x - CELL * 0.4, t.y - CELL * 0.4, CELL * 0.8, CELL * 0.8);

            // 汉字
            ctx.save();
            ctx.font = `900 ${fontSize}px 'Ma Shan Zheng', 'Noto Serif SC', serif`;
            ctx.fillStyle = t.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = t.color;
            ctx.shadowBlur = 8;
            ctx.fillText(t.type, t.x, t.y);
            ctx.restore();

            // 等级标记
            if (t.level > 1) {
                ctx.font = `bold ${CELL * 0.18}px sans-serif`;
                ctx.fillStyle = '#ffe080';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText('★'.repeat(t.level - 1), t.x + CELL * 0.4, t.y + CELL * 0.4);
            }
        });
    }

    // ============================================================
    //  敌人相关
    // ============================================================
    function spawnEnemy(type) {
        const def = ENEMY_DEFS[type];
        const waveScale = 1 + (currentWave - 1) * 0.18;
        const e = {
            type: type,
            hp: Math.floor(def.hp * waveScale * HP_MULT),
            maxHp: Math.floor(def.hp * waveScale * HP_MULT),
            speed: def.speed * (1 + (currentWave - 1) * 0.03),
            baseSpeed: def.speed * (1 + (currentWave - 1) * 0.03),
            reward: def.reward,
            color: def.color,
            size: def.size,
            pathIndex: 0,
            pathProgress: 0,
            x: pixelPath[0].x,
            y: pixelPath[0].y,
            alive: true,
            slowTimer: 0,
            slowFactor: 1,
            dotTimer: 0,
            dotDmg: 0,
            dotDur: 0,
            dotSource: null,
            hitFlash: 0
        };
        enemies.push(e);
    }

    function updateEnemies(dt) {
        enemies.forEach(e => {
            if (!e.alive) return;

            // 减速效果
            if (e.slowTimer > 0) {
                e.slowTimer -= dt;
                if (e.slowTimer <= 0) e.slowFactor = 1;
            }

            // 持续伤害
            if (e.dotTimer > 0) {
                e.dotTimer -= dt;
                e.hp -= (e.dotDmg || 0) * dt;
                if (e.dotTimer <= 0) {
                    e.dotDmg = 0;
                }
            }

            // 闪白衰减
            if (e.hitFlash > 0) e.hitFlash -= dt * 5;

            // 沿路径移动
            const speed = e.baseSpeed * e.slowFactor * CELL * dt;
            let remaining = speed;

            while (remaining > 0 && e.pathIndex < pixelPath.length - 1) {
                const target = pixelPath[e.pathIndex + 1];
                const dx = target.x - e.x;
                const dy = target.y - e.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= remaining) {
                    e.x = target.x;
                    e.y = target.y;
                    remaining -= dist;
                    e.pathIndex++;
                } else {
                    const ratio = remaining / dist;
                    e.x += dx * ratio;
                    e.y += dy * ratio;
                    remaining = 0;
                }
            }

            // 到达终点
            if (e.pathIndex >= pixelPath.length - 1) {
                e.alive = false;
                baseHP--;
                spawnDeathParticles(e.x, e.y, '#ff4040', 5);
                if (baseHP <= 0) {
                    endGame(false);
                }
            }

            // 死亡检查
            if (e.hp <= 0 && e.alive) {
                e.alive = false;
                gold += e.reward;
                kills++;
                spawnDeathParticles(e.x, e.y, e.color, 15);
                addFloatingText(e.x, e.y, '+' + e.reward + '💰', '#ffd700');
            }
        });

        // 清理死亡敌人
        enemies = enemies.filter(e => e.alive);
    }

    function drawEnemies(time) {
        enemies.forEach(e => {
            if (!e.alive) return;
            const fontSize = CELL * 0.5 * e.size;

            // 阴影
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.font = `900 ${fontSize}px 'Ma Shan Zheng', serif`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(e.type, e.x + 2, e.y + 2);
            ctx.restore();

            // 主体
            ctx.save();
            ctx.font = `900 ${fontSize}px 'Ma Shan Zheng', serif`;
            let color = e.color;
            if (e.hitFlash > 0) color = '#ffffff';
            if (e.slowTimer > 0) color = blendColor(e.color, '#4090ff', 0.3);
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = e.color;
            ctx.shadowBlur = 6;
            ctx.fillText(e.type, e.x, e.y);
            ctx.restore();

            // 血条
            const barW = CELL * 0.6;
            const barH = 3;
            const barX = e.x - barW / 2;
            const barY = e.y - fontSize * 0.4 - 6;
            const hpRatio = Math.max(0, e.hp / e.maxHp);

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX, barY, barW, barH);
            const hpColor = hpRatio > 0.5 ? '#80c060' : hpRatio > 0.25 ? '#c0a030' : '#c04030';
            ctx.fillStyle = hpColor;
            ctx.fillRect(barX, barY, barW * hpRatio, barH);

            // DOT指示
            if (e.dotTimer > 0) {
                ctx.fillStyle = 'rgba(64,144,208,0.6)';
                ctx.fillRect(barX, barY + barH, barW * (e.dotTimer / 3), 2);
            }
        });
    }

    // ============================================================
    //  塔攻击逻辑
    // ============================================================
    function updateTowers(dt) {
        const dmgMult = activeSynergies['金'] ? 1.25 : 1;

        towers.forEach(t => {
            t.cooldown -= dt;
            if (t.cooldown > 0) return;

            // 寻找范围内敌人（优先最前面的）
            let target = null;
            let bestProgress = -1;
            enemies.forEach(e => {
                if (!e.alive) return;
                const dx = e.x - t.x;
                const dy = e.y - t.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= t.range * CELL && e.pathIndex > bestProgress) {
                    bestProgress = e.pathIndex;
                    target = e;
                }
            });

            if (!target) return;

            t.cooldown = 1 / t.fireRate;
            t.angle = Math.atan2(target.y - t.y, target.x - t.x);
            const dmg = Math.floor(t.damage * dmgMult);

            switch (t.attackType) {
                case 'single':
                    fireProjectile(t, target, dmg, 'single');
                    break;
                case 'pierce':
                    fireProjectile(t, target, dmg, 'pierce');
                    break;
                case 'rapid':
                    fireProjectile(t, target, dmg, 'single');
                    break;
                case 'ghost':
                    fireProjectile(t, target, dmg, 'ghost');
                    break;
                case 'slow':
                    applySlow(t, target, dmg);
                    break;
                case 'aoe':
                    fireProjectile(t, target, dmg, 'aoe');
                    break;
                case 'dot':
                    applyDot(t, target, dmg);
                    break;
                case 'chain':
                    fireChain(t, target, dmg);
                    break;
            }

            // 墨汁飞溅粒子
            spawnInkSplash(t.x, t.y, t.color, 3);
        });
    }

    function fireProjectile(tower, target, damage, type) {
        projectiles.push({
            x: tower.x,
            y: tower.y,
            tx: target.x,
            ty: target.y,
            target: target,
            damage: damage,
            type: type,
            color: tower.color,
            speed: CELL * 6,
            pierce: type === 'pierce' ? tower.pierce : 0,
            aoeRadius: type === 'aoe' ? tower.aoeRadius * CELL : 0,
            alive: true
        });
    }

    function applySlow(tower, target, damage) {
        target.hp -= damage;
        target.hitFlash = 1;
        target.slowTimer = tower.slowDur;
        target.slowFactor = tower.slowFactor;
        addFloatingText(target.x, target.y - 10, '-' + damage, '#7090c0');
        spawnInkSplash(target.x, target.y, '#7090c0', 4);

        // 范围减速
        enemies.forEach(e => {
            if (e === target || !e.alive) return;
            const dx = e.x - tower.x;
            const dy = e.y - tower.y;
            if (Math.sqrt(dx * dx + dy * dy) <= tower.range * CELL * 0.7) {
                e.slowTimer = tower.slowDur * 0.5;
                e.slowFactor = Math.min(e.slowFactor, 0.7);
            }
        });
    }

    function applyDot(tower, target, damage) {
        target.hp -= damage * 0.5;
        target.hitFlash = 1;
        target.dotTimer = tower.dotDur;
        target.dotDmg = tower.dotDmg;
        addFloatingText(target.x, target.y - 10, '-' + damage, '#4090d0');
        spawnInkSplash(target.x, target.y, '#4090d0', 4);
    }

    function fireChain(tower, target, damage) {
        const hit = new Set();
        let current = target;
        let remaining = tower.chainCount;
        let prevX = tower.x, prevY = tower.y;

        for (let i = 0; i <= remaining && current; i++) {
            if (!current.alive) break;
            current.hp -= damage;
            current.hitFlash = 1;
            addFloatingText(current.x, current.y - 10, '-' + damage, '#c0b0ff');
            hit.add(current);

            // 闪电线
            lightnings.push({
                x1: prevX,
                y1: prevY,
                x2: current.x,
                y2: current.y,
                life: 0.3,
                color: '#c0b0ff'
            });
            prevX = current.x;
            prevY = current.y;

            // 寻找下一个链式目标
            let nextTarget = null;
            let minDist = tower.chainRange * CELL;
            enemies.forEach(e => {
                if (!e.alive || hit.has(e)) return;
                const dx = e.x - current.x;
                const dy = e.y - current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    nextTarget = e;
                }
            });
            current = nextTarget;
        }
        spawnInkSplash(tower.x, tower.y, '#c0b0ff', 5);
    }

    function updateProjectiles(dt) {
        projectiles.forEach(p => {
            if (!p.alive) return;

            const dx = p.tx - p.x;
            const dy = p.ty - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const move = p.speed * dt;

            if (dist <= move || dist < 5) {
                // 命中
                if (p.target && p.target.alive) {
                    p.target.hp -= p.damage;
                    p.target.hitFlash = 1;
                    addFloatingText(p.target.x, p.target.y - 10, '-' + p.damage, p.color);
                    spawnInkSplash(p.target.x, p.target.y, p.color, 3);
                } else if (p.target && !p.target.alive) {
                    // 目标已死亡，直接销毁弹道
                    p.alive = false;
                    return;
                }

                // AOE
                if (p.aoeRadius > 0) {
                    enemies.forEach(e => {
                        if (!e.alive || e === p.target) return;
                        const ex = e.x - p.tx;
                        const ey = e.y - p.ty;
                        if (Math.sqrt(ex * ex + ey * ey) <= p.aoeRadius) {
                            e.hp -= Math.floor(p.damage * 0.6);
                            e.hitFlash = 1;
                            addFloatingText(e.x, e.y - 10, '-' + Math.floor(p.damage * 0.6), p.color);
                        }
                    });
                    spawnInkSplash(p.tx, p.ty, p.color, 8);
                }

                // 穿刺
                if (p.pierce > 0) {
                    p.pierce--;
                    // 寻找下一个目标
                    let nextTarget = null;
                    let minDist = CELL * 3;
                    enemies.forEach(e => {
                        if (!e.alive || e === p.target) return;
                        const ex = e.x - p.x;
                        const ey = e.y - p.y;
                        const d = Math.sqrt(ex * ex + ey * ey);
                        if (d < minDist) { minDist = d; nextTarget = e; }
                    });
                    if (nextTarget) {
                        p.target = nextTarget;
                        p.tx = nextTarget.x;
                        p.ty = nextTarget.y;
                        return;
                    }
                }

                p.alive = false;
            } else {
                const ratio = move / dist;
                p.x += dx * ratio;
                p.y += dy * ratio;
            }
        });

        projectiles = projectiles.filter(p => p.alive);
    }

    function drawProjectiles() {
        projectiles.forEach(p => {
            if (!p.alive) return;
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.restore();

            // 拖尾
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            const dx = p.x - (p.tx - p.x) * 0.3;
            const dy = p.y - (p.ty - p.y) * 0.3;
            ctx.lineTo(dx, dy);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        });
    }

    // ============================================================
    //  闪电效果
    // ============================================================
    function updateLightnings(dt) {
        lightnings.forEach(l => l.life -= dt);
        lightnings = lightnings.filter(l => l.life > 0);
    }

    function drawLightnings() {
        lightnings.forEach(l => {
            ctx.save();
            ctx.globalAlpha = l.life / 0.3;
            ctx.strokeStyle = l.color;
            ctx.lineWidth = 2;
            ctx.shadowColor = l.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(l.x1, l.y1);
            // 锯齿形闪电
            const segs = 5;
            for (let i = 1; i <= segs; i++) {
                const t = i / segs;
                const mx = l.x1 + (l.x2 - l.x1) * t + (Math.random() - 0.5) * 15;
                const my = l.y1 + (l.y2 - l.y1) * t + (Math.random() - 0.5) * 15;
                ctx.lineTo(mx, my);
            }
            ctx.stroke();
            ctx.restore();
        });
    }

    // ============================================================
    //  粒子系统
    // ============================================================
    function spawnInkSplash(x, y, color, count) {
        // 粒子数量上限，防止内存泄漏
        const MAX_PARTICLES = 300;
        if (particles.length >= MAX_PARTICLES) return;
        for (let i = 0; i < count; i++) {
            if (particles.length >= MAX_PARTICLES) break;
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * 60;
            particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.3 + Math.random() * 0.4,
                maxLife: 0.3 + Math.random() * 0.4,
                color: color,
                size: 2 + Math.random() * 4,
                type: 'ink'
            });
        }
    }

    function spawnDeathParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 20 + Math.random() * 80;
            particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 20,
                life: 0.5 + Math.random() * 0.8,
                maxLife: 0.5 + Math.random() * 0.8,
                color: color,
                size: 3 + Math.random() * 6,
                type: 'death'
            });
        }
    }

    function updateParticles(dt) {
        particles.forEach(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 60 * dt; // 重力
            p.life -= dt;
        });
        particles = particles.filter(p => p.life > 0);
    }

    function drawParticles() {
        particles.forEach(p => {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            if (p.type === 'death') {
                // 墨点飘散
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
            } else {
                // 墨汁飞溅
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 4;
                ctx.fill();
            }
            ctx.restore();
        });
    }

    // ============================================================
    //  飘字
    // ============================================================
    function addFloatingText(x, y, text, color) {
        floatingTexts.push({
            x: x, y: y,
            text: text,
            color: color,
            life: 1.0,
            vy: -40
        });
    }

    function updateFloatingTexts(dt) {
        floatingTexts.forEach(ft => {
            ft.y += ft.vy * dt;
            ft.vy *= 0.95;
            ft.life -= dt;
        });
        floatingTexts = floatingTexts.filter(ft => ft.life > 0);
    }

    function drawFloatingTexts() {
        floatingTexts.forEach(ft => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, ft.life);
            ctx.font = `bold ${14}px 'Ma Shan Zheng', serif`;
            ctx.fillStyle = ft.color;
            ctx.textAlign = 'center';
            ctx.shadowColor = ft.color;
            ctx.shadowBlur = 4;
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.restore();
        });
    }

    // ============================================================
    //  羁绊系统
    // ============================================================
    function checkSynergies() {
        activeSynergies = {};
        const radicalGroups = {};

        towers.forEach(t => {
            const rad = RADICAL_MAP[t.type] || t.type;
            if (!radicalGroups[rad]) radicalGroups[rad] = [];
            radicalGroups[rad].push(t);
        });

        // 三点水羁绊（水塔>=2）
        if (radicalGroups['氵'] && radicalGroups['氵'].length >= 2) {
            activeSynergies['氵'] = true;
        }

        // 金字旁羁绊（没有金字旁塔，用刀剑代替 - 刂旁>=2）
        if (radicalGroups['刂'] && radicalGroups['刂'].length >= 2) {
            activeSynergies['金'] = true;
        }

        // 刀光剑影：刀、光、剑、影四字相邻
        const hasDaoGJY = checkAdjacentSet(['刀', '剑', '影']);
        if (hasDaoGJY) {
            activeSynergies['刀光剑影'] = true;
        }

        // 水火不容：水火相邻
        const hasSHBR = checkAdjacentPair('水', '火');
        if (hasSHBR) {
            activeSynergies['水火不容'] = true;
        }

        updateSynergyUI();
    }

    function checkAdjacentSet(types) {
        const typeSet = new Set(types);
        const positions = {};
        towers.forEach(t => {
            if (typeSet.has(t.type)) {
                positions[t.type] = { c: t.col, r: t.row };
            }
        });
        if (Object.keys(positions).length < types.length) return false;

        // 检查是否所有塔都相邻（曼哈顿距离<=2）
        const posArr = Object.values(positions);
        for (let i = 0; i < posArr.length; i++) {
            for (let j = i + 1; j < posArr.length; j++) {
                const dist = Math.abs(posArr[i].c - posArr[j].c) + Math.abs(posArr[i].r - posArr[j].r);
                if (dist > 2) return false;
            }
        }
        return true;
    }

    function checkAdjacentPair(type1, type2) {
        const t1 = towers.find(t => t.type === type1);
        const t2 = towers.find(t => t.type === type2);
        if (!t1 || !t2) return false;
        const dist = Math.abs(t1.col - t2.col) + Math.abs(t1.row - t2.row);
        return dist <= 2;
    }

    function updateSynergyUI() {
        const el = document.getElementById('synergy-info');
        let html = '';
        if (activeSynergies['氵']) html += '<div style="color:#4090d0">💧 水系减伤</div>';
        if (activeSynergies['金']) html += '<div style="color:#d4a040">⚔️ 刃系增伤25%</div>';
        if (activeSynergies['刀光剑影']) html += '<div style="color:#ffe080">✨ 刀光剑影</div>';
        if (activeSynergies['水火不容']) html += '<div style="color:#e08040">💥 水火不容</div>';
        el.innerHTML = html;
    }

    // 刀光剑影大招
    let ultimateTimer = 0;
    function triggerUltimate() {
        enemies.forEach(e => {
            if (!e.alive) return;
            e.hp -= 500;
            e.hitFlash = 1;
            addFloatingText(e.x, e.y, '-500', '#ffe080');
            spawnDeathParticles(e.x, e.y, '#ffe080', 10);
        });
        // 全屏闪白
        ultimateTimer = 0.5;
    }

    // 水火不容爆炸
    function triggerWaterFireExplosion() {
        const waterTower = towers.find(t => t.type === '水');
        const fireTower = towers.find(t => t.type === '火');
        if (!waterTower || !fireTower) return;
        const cx = (waterTower.x + fireTower.x) / 2;
        const cy = (waterTower.y + fireTower.y) / 2;
        const radius = CELL * 3;
        enemies.forEach(e => {
            if (!e.alive) return;
            const dx = e.x - cx;
            const dy = e.y - cy;
            if (Math.sqrt(dx * dx + dy * dy) <= radius) {
                e.hp -= 200;
                e.hitFlash = 1;
                addFloatingText(e.x, e.y, '-200', '#e08040');
            }
        });
        spawnDeathParticles(cx, cy, '#e08040', 20);
        spawnInkSplash(cx, cy, '#e08040', 15);
    }

    // ============================================================
    //  波次管理
    // ============================================================
    function startWave() {
        if (waveActive || currentWave >= TOTAL_WAVES || gameOver) return;
        currentWave++;
        waveActive = true;
        spawnQueue = [];

        const waveDef = WAVE_DEFS[currentWave - 1];
        waveDef.forEach(group => {
            for (let i = 0; i < group.count; i++) {
                spawnQueue.push({ type: group.type, delay: group.interval });
            }
        });

        spawnTimer = 0;
        updateUI();
    }

    function updateWave(dt) {
        if (!waveActive) return;

        // 生成敌人
        if (spawnQueue.length > 0) {
            spawnTimer -= dt;
            if (spawnTimer <= 0) {
                const next = spawnQueue.shift();
                spawnEnemy(next.type);
                spawnTimer = next.delay;
            }
        }

        // 检查波次结束
        if (spawnQueue.length === 0 && enemies.length === 0) {
            waveActive = false;
            if (currentWave >= TOTAL_WAVES) {
                endGame(true);
            } else if (autoWave) {
                waveTimer = 3;
            }
        }

        // 自动出波
        if (!waveActive && autoWave && waveTimer > 0) {
            waveTimer -= dt;
            if (waveTimer <= 0) {
                startWave();
            }
        }

        // 羁绊触发
        if (activeSynergies['刀光剑影'] && enemies.length > 0 && Math.random() < dt * 0.3) {
            triggerUltimate();
        }
        if (activeSynergies['水火不容'] && enemies.length > 0 && Math.random() < dt * 0.5) {
            triggerWaterFireExplosion();
        }
    }

    // ============================================================
    //  游戏结束
    // ============================================================
    function endGame(win) {
        gameOver = true;
        const overlay = document.getElementById('game-over-overlay');
        const title = document.getElementById('game-over-title');
        const stats = document.getElementById('game-over-stats');

        if (win) {
            title.textContent = '🎉 守关成功！';
            title.style.color = '#ffd700';
        } else {
            title.textContent = '💀 关隘失守...';
            title.style.color = '#ff4040';
        }
        stats.innerHTML = `波次：${currentWave} / ${TOTAL_WAVES}<br>击杀：${kills}<br>剩余金币：${gold}`;
        overlay.style.display = 'flex';
    }

    function restartGame() {
        gold = 200;
        baseHP = 20;
        currentWave = 0;
        kills = 0;
        gameSpeed = 1;
        paused = false;
        gameOver = false;
        autoWave = false;
        waveActive = false;
        waveTimer = 0;
        spawnQueue = [];
        spawnTimer = 0;
        selectedTowerType = null;
        selectedTower = null;
        towers = [];
        enemies = [];
        projectiles = [];
        particles = [];
        floatingTexts = [];
        lightnings = [];
        activeSynergies = {};
        ultimateTimer = 0;

        document.getElementById('game-over-overlay').style.display = 'none';
        document.getElementById('auto-wave-btn').classList.remove('active');
        document.getElementById('speed1-btn').classList.add('active');
        document.getElementById('speed2-btn').classList.remove('active');
        document.getElementById('speed3-btn').classList.remove('active');
        updateUI();
        updateSynergyUI();
    }

    // ============================================================
    //  UI更新
    // ============================================================
    function updateUI() {
        document.getElementById('gold-display').textContent = gold;
        document.getElementById('hp-display').textContent = baseHP;
        document.getElementById('wave-display').textContent = currentWave + ' / ' + TOTAL_WAVES;
        document.getElementById('kill-display').textContent = kills;

        // 更新塔按钮状态
        document.querySelectorAll('.tower-btn[data-tower]').forEach(btn => {
            const type = btn.dataset.tower;
            const cost = Math.floor(TOWER_DEFS[type].cost * COST_MULT);
            btn.classList.toggle('disabled', gold < cost);
            btn.classList.toggle('selected', selectedTowerType === type);
        });

        // 选中塔信息
        const info = document.getElementById('selected-info');
        const actionBtns = document.getElementById('action-btns');
        if (selectedTower) {
            const t = selectedTower;
            const upgradeCost = t.level < 3 ? Math.floor(TOWER_DEFS[t.type].cost * COST_MULT * t.level * 0.8) : '---';
            const sellValue = Math.floor(t.totalCost * 0.6);
            info.innerHTML = `<div style="font-size:24px;color:${t.color}">${t.type}</div>` +
                `<div>Lv.${t.level} 伤:${t.damage}</div>` +
                `<div>升:${upgradeCost}金 售:${sellValue}金</div>`;
            actionBtns.style.display = 'flex';
            document.getElementById('upgrade-btn').textContent = t.level < 3 ? `⬆ 升级(${upgradeCost})` : '已满级';
            document.getElementById('sell-btn').textContent = `💰 出售(${sellValue})`;
        } else {
            info.innerHTML = selectedTowerType ? `已选：${selectedTowerType}<br>点击空地放置` : '';
            actionBtns.style.display = 'none';
        }
    }

    // ============================================================
    //  输入处理
    // ============================================================
    function getGridPos(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;
        const c = Math.floor((mx - offsetX) / CELL);
        const r = Math.floor((my - offsetY) / CELL);
        return { c, r, mx, my };
    }

    canvas.addEventListener('click', (e) => {
        if (gameOver) return;
        const pos = getGridPos(e.clientX, e.clientY);
        if (pos.c < 0 || pos.c >= COLS || pos.r < 0 || pos.r >= ROWS) return;

        const existing = getTowerAt(pos.c, pos.r);
        if (existing) {
            selectedTower = existing;
            selectedTowerType = null;
        } else if (selectedTowerType) {
            if (createTower(selectedTowerType, pos.c, pos.r)) {
                // 放置成功
                if (gold < Math.floor(TOWER_DEFS[selectedTowerType].cost * COST_MULT)) {
                    selectedTowerType = null;
                }
            }
        } else {
            selectedTower = null;
        }
        updateUI();
    });

    canvas.addEventListener('mousemove', (e) => {
        const pos = getGridPos(e.clientX, e.clientY);
        hoverCell = (pos.c >= 0 && pos.c < COLS && pos.r >= 0 && pos.r < ROWS) ? { c: pos.c, r: pos.r } : null;
    });

    canvas.addEventListener('mouseleave', () => {
        hoverCell = null;
    });

    // 触摸支持
    let touchHandled = false;
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        touchHandled = true;
        // 阻止后续的click事件模拟
        setTimeout(() => { touchHandled = false; }, 300);

        if (gameOver) return;
        const touch = e.touches[0];
        const pos = getGridPos(touch.clientX, touch.clientY);
        if (pos.c < 0 || pos.c >= COLS || pos.r < 0 || pos.r >= ROWS) return;

        const existing = getTowerAt(pos.c, pos.r);
        if (existing) {
            selectedTower = existing;
            selectedTowerType = null;
        } else if (selectedTowerType) {
            if (createTower(selectedTowerType, pos.c, pos.r)) {
                if (gold < Math.floor(TOWER_DEFS[selectedTowerType].cost * COST_MULT)) {
                    selectedTowerType = null;
                }
            }
        } else {
            selectedTower = null;
        }
        updateUI();
    }, { passive: false });

    // 阻止canvas上的click事件（移动端会模拟click，导致重复触发）
    canvas.addEventListener('click', (e) => {
        if (touchHandled) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    });

    // 塔按钮
    document.querySelectorAll('.tower-btn[data-tower]').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.tower;
            const cost = Math.floor(TOWER_DEFS[type].cost * COST_MULT);
            if (gold < cost) return;
            selectedTowerType = selectedTowerType === type ? null : type;
            selectedTower = null;
            updateUI();
        });
    });

    // 升级/出售
    document.getElementById('upgrade-btn').addEventListener('click', () => {
        if (selectedTower) {
            upgradeTower(selectedTower);
            updateUI();
        }
    });
    document.getElementById('sell-btn').addEventListener('click', () => {
        if (selectedTower) {
            sellTower(selectedTower);
        }
    });

    // 出波
    document.getElementById('wave-btn').addEventListener('click', startWave);

    // 自动出波
    document.getElementById('auto-wave-btn').addEventListener('click', () => {
        autoWave = !autoWave;
        document.getElementById('auto-wave-btn').classList.toggle('active', autoWave);
    });

    // 暂停
    document.getElementById('pause-btn').addEventListener('click', () => {
        paused = !paused;
        document.getElementById('pause-btn').textContent = paused ? '▶' : '⏸';
        document.getElementById('pause-btn').classList.toggle('active', paused);
    });

    // 倍速
    ['speed1-btn', 'speed2-btn', 'speed3-btn'].forEach((id, i) => {
        document.getElementById(id).addEventListener('click', () => {
            gameSpeed = i + 1;
            document.querySelectorAll('.speed-row .ctrl-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(id).classList.add('active');
        });
    });

    // 重新开始
    document.getElementById('restart-btn').addEventListener('click', restartGame);

    // 页面可见性变化：切后台时暂停，返回时恢复（不重置游戏）
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // 切到后台时自动暂停
            if (!paused && !gameOver) {
                paused = true;
                document.getElementById('pause-btn').textContent = '▶';
                document.getElementById('pause-btn').classList.add('active');
            }
        } else {
            // 返回前台时恢复（如果之前是自动暂停的）
            // 不自动恢复，让用户手动点击继续，避免时间跳跃导致的问题
        }
    });

    // ============================================================
    //  辅助函数
    // ============================================================
    function blendColor(c1, c2, ratio) {
        if (!c1 || !c2 || c1.length < 7 || c2.length < 7) return '#ffffff';
        const r1 = parseInt(c1.slice(1, 3), 16) || 0;
        const g1 = parseInt(c1.slice(3, 5), 16) || 0;
        const b1 = parseInt(c1.slice(5, 7), 16) || 0;
        const r2 = parseInt(c2.slice(1, 3), 16) || 0;
        const g2 = parseInt(c2.slice(3, 5), 16) || 0;
        const b2 = parseInt(c2.slice(5, 7), 16) || 0;
        const r = Math.floor(r1 + (r2 - r1) * ratio);
        const g = Math.floor(g1 + (g2 - g1) * ratio);
        const b = Math.floor(b1 + (b2 - b1) * ratio);
        return `rgb(${r},${g},${b})`;
    }

    // ============================================================
    //  尺寸自适应
    // ============================================================
    let resizeTimer = null;
    let lastResizeTime = 0;
    function resize() {
        // 防抖：移动端地址栏变化会频繁触发resize
        // Safari需要更长的防抖时间
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const delay = isSafari ? 500 : 200;

        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            doResize();
        }, delay);
    }

    function doResize() {
        const container = document.getElementById('main-area');
        const panel = document.getElementById('tower-panel');
        const panelW = panel ? panel.offsetWidth : 140;
        const w = container.clientWidth - panelW;
        const h = container.clientHeight;

        // 只在尺寸真正变化时才重置canvas，避免移动端地址栏变化导致的问题
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }

        // 计算格子大小
        const cellW = w / COLS;
        const cellH = h / ROWS;
        CELL = Math.floor(Math.min(cellW, cellH));

        // 居中偏移
        offsetX = Math.floor((w - COLS * CELL) / 2);
        offsetY = Math.floor((h - ROWS * CELL) / 2);

        // 重建像素路径和更新塔位置
        buildPixelPath();
        towers.forEach(t => {
            t.x = (t.col + 0.5) * CELL + offsetX;
            t.y = (t.row + 0.5) * CELL + offsetY;
        });

        // 只在首次初始化时创建云雾，resize时不重置
        if (clouds.length === 0) initClouds();
    }

    window.addEventListener('resize', resize);

    // ============================================================
    //  主循环
    // ============================================================
    let lastTime = 0;
    let uiUpdateTimer = 0;
    let loopStarted = false;

    function gameLoop(timestamp) {
        requestAnimationFrame(gameLoop);

        try {
            const rawDt = Math.min((timestamp - lastTime) / 1000, 0.1);
            lastTime = timestamp;

            if (paused || gameOver) {
                // 仍然绘制
                render(timestamp / 1000);
                return;
            }

            const dt = rawDt * gameSpeed;

            // 更新
            updateClouds(dt);
            updateWave(dt);
            updateTowers(dt);
            updateEnemies(dt);
            updateProjectiles(dt);
            updateLightnings(dt);
            updateParticles(dt);
            updateFloatingTexts(dt);

            if (ultimateTimer > 0) ultimateTimer -= dt;

            // 定期更新UI
            uiUpdateTimer += rawDt;
            if (uiUpdateTimer > 0.2) {
                uiUpdateTimer = 0;
                updateUI();
            }

            render(timestamp / 1000);
        } catch (e) {
            console.error('GameLoop Error:', e);
        }
    }

    function render(time) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawBackground();
        drawClouds();
        drawGrid();
        drawTowers(time);
        drawProjectiles();
        drawLightnings();
        drawEnemies(time);
        drawParticles();
        drawFloatingTexts();

        // 大招闪白
        if (ultimateTimer > 0) {
            ctx.save();
            ctx.globalAlpha = ultimateTimer * 0.4;
            ctx.fillStyle = '#ffe080';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }

        // 暂停提示
        if (paused) {
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
            ctx.font = `48px 'Ma Shan Zheng'`;
            ctx.fillStyle = '#e0d0b0';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('暂停中', canvas.width / 2, canvas.height / 2);
            ctx.restore();
        }
    }

    // ============================================================
    //  Safari专用：阻止双指缩放导致页面重载
    // ============================================================
    document.addEventListener('gesturestart', function(e) {
        e.preventDefault();
    });
    document.addEventListener('gesturechange', function(e) {
        e.preventDefault();
    });
    document.addEventListener('gestureend', function(e) {
        e.preventDefault();
    });

    // 阻止touchmove默认行为（防止Safari橡皮筋效果）
    document.addEventListener('touchmove', function(e) {
        if (e.target === canvas) {
            e.preventDefault();
        }
    }, { passive: false });

    // ============================================================
    //  初始化
    // ============================================================
    let inited = false;
    function init() {
        if (inited) return;
        inited = true;
        resize();
        updateUI();
        lastTime = performance.now();
        if (!loopStarted) {
            loopStarted = true;
            requestAnimationFrame(gameLoop);
        }
    }

    // 等待字体加载
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(init);
    }
    // 备用：window.load 也触发，但用 inited 防止重复
    window.addEventListener('load', init);

})();
