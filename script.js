async function main() {

    // =========================================================================
    // 1. CARREGAR DADOS (CSV + GeoJSON Local)
    // =========================================================================
    
    // Carrega seu CSV
    const rawData = await d3.csv("eurepoc_dyadic_dataset_0_1.csv");
    
    // Carrega seu Mapa Local
    const worldData = await d3.json("world.geojson");

    // =========================================================================
    // 2. LIMPEZA E TRATAMENTO
    // =========================================================================
    
    const ignorar = ["Not available", "Unknown", "Other"];

    const dadosConflitos = rawData.map(d => {
        let start = null;
        if (d.start_date && d.start_date.toLowerCase() !== "not available") {
            const cleanStr = d.start_date.replace(" ", "T");
            const date = new Date(cleanStr);
            if (!isNaN(date)) start = date;
        }

        const setoresRaw = d.receiver_subcategory || d.receiver_category || "";
        const setoresLimpos = setoresRaw.replace(/[\[\]'"]/g, "").split(/[;,]/)
            .map(s => s.trim())
            .filter(s => s && !ignorar.includes(s));
            
        const opsRaw = d.operation_type || "";
        const opsLimpos = opsRaw.replace(/[\[\]'"]/g, "").split(/[;,]/)
            .map(s => s.trim())
            .filter(s => s && !ignorar.includes(s));

        return {
            id: d.incident_id,
            data: start,
            ano: start ? start.getFullYear() : null,
            atacante: d.initiator_country || "Unknown",
            vitima: d.receiver_country || "Unknown",
            tipos_lista: opsLimpos
        };
    }).filter(d => d.data !== null && d.ano >= 2010); // Filtra erros e foca de 2010 pra frente


    // =========================================================================
    // 3. CRIAÇÃO DOS GRÁFICOS
    // =========================================================================

    const widthPadrao = document.querySelector(".sticky-chart").offsetWidth || 600; 

    // --- GRÁFICO 1: MAPA (PASSO 1) ---
    // Objetivo: Mostrar EUA e Rússia/Ucrânia iluminados
    
    const countries = worldData; 
    
    const mapCounts = d3.rollup(dadosConflitos, v => v.length, d => {
        // CORREÇÃO CRÍTICA DE NOMES:
        let pais = d.vitima;
        if (pais === "United States") return "United States of America";
        if (pais === "Russian Federation" || pais === "Russia") return "Russia"; 
        if (pais === "Korea, Republic of") return "South Korea";
        return pais;
    });

    const plotMapa = Plot.plot({
        // title: "Mapa Global de Incidentes",
        width: widthPadrao,
        height: 500,
        projection: "equal-earth",
        color: { 
            scheme: "Reds", 
            type: "log", // Escala Logarítmica (ESSENCIAL)
            label: "Incidentes (Log)", 
            legend: true, 
            domain: [1, d3.max(mapCounts.values())] // Evita erro log(0)
        },
        marks: [
            Plot.sphere({fill: "#f8f9fa"}),
            Plot.geo(countries, {
                fill: d => mapCounts.get(d.properties.name),
                stroke: "white",
                strokeWidth: 0.5,
                tip: true,
                title: d => `${d.properties.name}\n${mapCounts.get(d.properties.name) || 0} ataques`
            }),
            Plot.sphere({stroke: "#ddd", strokeWidth: 0.5})
        ]
    });

    renderChart("vis-mapa", plotMapa);


    // --- GRÁFICO 2: EVOLUÇÃO TEMPORAL (PASSO 2) ---
    // Objetivo: Mostrar o pico da guerra em 2022/2023
    
    const dadosPorAno = d3.rollup(dadosConflitos, v => v.length, d => d.ano);
    const timelineData = Array.from(dadosPorAno, ([ano, total]) => ({ano, total}))
        .sort((a, b) => a.ano - b.ano);

    const plotTemporal = Plot.plot({
        // title: "A Escalada do Conflito",
        width: widthPadrao,
        height: 400,
        x: { label: "Ano", tickFormat: "d", grid: true },
        y: { label: "Total de Ataques", grid: true },
        marks: [
            // Área sombreada para dar volume
            Plot.areaY(timelineData, {x: "ano", y: "total", fill: "steelblue", fillOpacity: 0.3}),
            // Linha forte
            Plot.line(timelineData, {x: "ano", y: "total", stroke: "steelblue", strokeWidth: 3}),
            // Bolinhas
            Plot.dot(timelineData, {x: "ano", y: "total", fill: "steelblue", tip: true}),
            
            // O TEXTO QUE PROVA A NARRATIVA:
            Plot.text(timelineData, {
                filter: d => d.ano === 2023,
                x: "ano", y: "total",
                text: d => `Pico Histórico: ${d.total}`,
                dy: -20, 
                fontWeight: "bold",
                fontSize: 14
            })
        ]
    });
    
    renderChart("vis-temporal", plotTemporal);


    // --- GRÁFICO 3: ARSENAL (PASSO 3) ---
    const contagemTipos = new Map();
    dadosConflitos.forEach(d => {
        d.tipos_lista.forEach(tipo => {
            contagemTipos.set(tipo, (contagemTipos.get(tipo) || 0) + 1);
        });
    });

    const dadosTipos = Array.from(contagemTipos, ([tipo, valor]) => ({tipo, valor}))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5); // Top 5 apenas

    const plotTipos = Plot.plot({
        width: widthPadrao,
        marginLeft: 180, // Espaço para nomes longos
        x: { label: "Quantidade", grid: true },
        y: { label: null, domain: dadosTipos.map(d => d.tipo) },
        marks: [
            Plot.barX(dadosTipos, {x: "valor", y: "tipo", fill: "purple", tip: true}),
            Plot.text(dadosTipos, {x: "valor", y: "tipo", text: "valor", dx: 5, textAnchor: "start"})
        ]
    });

    renderChart("vis-barras", plotTipos);


    // --- GRÁFICO 4: ORIGEM (PASSO 4) ---
    const origemCounts = d3.rollup(dadosConflitos, v => v.length, d => d.atacante);
    const dadosOrigem = Array.from(origemCounts, ([pais, valor]) => ({pais, valor}))
        .filter(d => d.pais !== "Unknown" && d.pais !== "Not attributed") // Remove desconhecidos
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5);

    const plotOrigem = Plot.plot({
        width: widthPadrao,
        marginLeft: 150,
        x: { label: "Ataques Iniciados", grid: true },
        y: { label: null, domain: dadosOrigem.map(d => d.pais) },
        marks: [
            Plot.barX(dadosOrigem, {x: "valor", y: "pais", fill: "orange", tip: true}),
            Plot.text(dadosOrigem, {x: "valor", y: "pais", text: "valor", dx: 5, textAnchor: "start"})
        ]
    });

    renderChart("vis-origem", plotOrigem);

    // Inicia o Scroll
    initScrollama();
}

// === FUNÇÕES AUXILIARES ===

function renderChart(id, plotElement) {
    const div = document.getElementById(id);
    if (div) {
        div.innerHTML = "";
        div.append(plotElement);
    } else {
        console.error(`Elemento com ID ${id} não encontrado no HTML.`);
    }
}

function initScrollama() {
    const steps = document.querySelectorAll('.step');
    const chartContainers = document.querySelectorAll('.chart-container');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Descobre qual gráfico mostrar
                const targetId = entry.target.getAttribute('data-chart');
                
                // Esconde todos
                chartContainers.forEach(c => c.classList.remove('active'));
                
                // Mostra o alvo
                const targetChart = document.getElementById(targetId);
                if (targetChart) {
                    targetChart.classList.add('active');
                }
            }
        });
    }, { threshold: 0.6 }); // 0.6 = Troca quando o texto estiver 60% na tela (mais suave)
    
    steps.forEach(step => observer.observe(step));
}

// Executa
main().catch(err => console.error("Erro ao carregar dados:", err));
