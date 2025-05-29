document.addEventListener('DOMContentLoaded', () => {

        const headerEl = document.querySelector('.hero'),
        canvas   = document.getElementById('bgCanvas'),
        ctx      = canvas.getContext('2d');
    let W, H, parts = [];
    function resizeCanvas(){
        W = canvas.width  = headerEl.clientWidth;
        H = canvas.height = headerEl.clientHeight;
        parts = [];
        for(let i=0; i<60; i++){
            parts.push({
            x: Math.random()*W,
            y: Math.random()*H,
            r: 1 + Math.random()*2,
            dx: (Math.random()-0.5)*0.4,
            dy: (Math.random()-0.5)*0.4
            });
        }
    }
    function drawParticles(){
        ctx.clearRect(0,0,W,H);
        ctx.fillStyle = 'rgba(0,100,200,0.3)';
        parts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
            ctx.fill();
            p.x += p.dx; p.y += p.dy;
            if (p.x<0||p.x>W) p.dx*=-1;
            if (p.y<0||p.y>H) p.dy*=-1;
        });
        requestAnimationFrame(drawParticles);
    }
    window.addEventListener('resize', () => { resizeCanvas(); });
    resizeCanvas();
    drawParticles();

    const map = L.map('map').setView([20,0],2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    const POP_THRESHOLD = 100_002;
    let rawValues = [], minPop = Infinity, maxPop = 0, minPopFiltered;
    let geoMap = {}, timeMap = {}, years = [];
    let loaded = 0;
    const slider = document.getElementById('yearSlider'),
        label  = document.getElementById('yearLabel');
    let markers = [];

    const legend = L.control({ position: 'bottomright' });

    // Парсим геоданные
    Papa.parse('data/worldcities.csv', {
    header: true, download: true, dynamicTyping: true,
    complete: res => {
        res.data.forEach(c => {
        if (c.city_ascii) {
            geoMap[c.city_ascii.toLowerCase()] = {
            lat: c.lat,
            lng: c.lng,
            fallbackPop: c.population
            };
        }
        });
        if (++loaded === 2) prepare();
    }
    });

    // Парсим временные ряды
    Papa.parse('data/pop_timeseries.csv', {
    header: true, download: true, dynamicTyping: true,
    complete: res => {
        res.data.forEach(r => {
        if (!r.City || !r['Record Type'] || !r['Record Type'].includes('Estimate')) return;
        const city = r.City.toLowerCase();
        const y = +r.Year, v = +r.Value;
        if (isNaN(y) || isNaN(v)) return;
        rawValues.push(v);
        if (v < minPop) minPop = v;
        if (v > maxPop) maxPop = v;
        if (!timeMap[city]) timeMap[city] = {};
        timeMap[city][y] = v;
        years.push(y);
        });
        years = Array.from(new Set(years)).sort((a,b)=>a-b);
        if (++loaded === 2) prepare();
    }
    });

    function prepare(){
        minPopFiltered = Math.min(...rawValues.filter(v => v >= POP_THRESHOLD));
        // добавляем легенду
        legend.onAdd = () => {
            const div = L.DomUtil.create('div','legend');
            div.innerHTML = `
            <div class="scale"></div>
            <div style="display:flex; justify-content:space-between;">
                <span>${POP_THRESHOLD.toLocaleString()}</span>
                <span>${Math.round(maxPop).toLocaleString()}</span>
            </div>
            `;
            return div;
        };
        legend.addTo(map);
        drawMarkers(+slider.value);
    }

    // возвращаем значение для города и года
    function getValue(city, year) {
    const tm = timeMap[city];
    if (tm) {
        if (tm[year] != null) return tm[year];

        const prevYears = years.filter(y => y < year).sort((a, b) => b - a);
        const nextYears = years.filter(y => y > year).sort((a, b) => a - b);

        const prevYear = prevYears.find(y => tm[y] != null);
        const nextYear = nextYears.find(y => tm[y] != null);

        const prevVal = prevYear != null ? tm[prevYear] : null;
        const nextVal = nextYear != null ? tm[nextYear] : null;

        if (prevVal != null && nextVal != null) {
            return (prevVal + nextVal) / 2;
        }
        if (prevVal != null) return prevVal;
        if (nextVal != null) return nextVal;
    }

    const fallback = geoMap[city]?.fallbackPop;
    if (fallback && fallback >= POP_THRESHOLD) return fallback;

    return null;
    }

    // цвет шкалы от синего к красному
    function getColor(val){
        const v   = Math.log10(val);
        const min = Math.log10(minPopFiltered);
        const max = Math.log10(maxPop);
        const t   = Math.min(1, Math.max(0, (v - min)/(max - min)));
        const hue = (1 - t) * 240;
        return `hsl(${hue},70%,50%)`;
    }

    // рисуем круги
    function drawMarkers(year) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    Object.keys(timeMap).forEach(city => {
        const geo = geoMap[city];
        if (!geo) return;

        const rawPop = getValue(city, year);
        if (rawPop == null || rawPop < POP_THRESHOLD) return;

        const pop = Math.round(rawPop);

        const m = L.circleMarker([geo.lat, geo.lng], {
        radius: Math.sqrt(pop) / 100,
        color: getColor(pop),
        fillColor: getColor(pop),
        fillOpacity: 0.7,
        weight: 1
        }).bindPopup(
        `<b>${city.charAt(0).toUpperCase() + city.slice(1)}</b><br>` +
        `Население: ${pop.toLocaleString()} человек`
        ).addTo(map);

        markers.push(m);
    });
    }

    // обновление по слайдеру
    slider.addEventListener('input', ()=>{
        const y = +slider.value;
        label.textContent = y;
        drawMarkers(y);
    });
});
