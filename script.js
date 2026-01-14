async function main() {

    async function main() {
async function main() { // <--- CORREÇÃO 1: Removida a duplicata aqui

    // =========================================================================
    // 1. CARREGAR DADOS REAIS
    // =========================================================================

    // AQUI ESTÁ A MUDANÇA: Usamos d3.csv para ler o arquivo que você subiu
    // Carrega seu CSV
    const rawData = await d3.csv("eurepoc_dyadic_dataset_0_1.csv");

    // O mapa continuamos puxando da internet (CDN) para facilitar, pois é um arquivo padrão
    // Carrega seu Mapa Local (GeoJSON)
    const worldData = await d3.json("world.geojson");


    // =========================================================================
    // 2. LIMPEZA E TRATAMENTO (Adaptado para o formato do seu CSV Real)
    // 2. LIMPEZA E TRATAMENTO
    // =========================================================================

    // Lista de termos para ignorar
    const ignorar = ["Not available", "Unknown", "Other"];

    const dadosConflitos = rawData.map(d => {
        // 1. Tratamento de Data (O seu CSV original usa datas reais)
        let start = null;
        if (d.start_date && d.start_date.toLowerCase() !== "not available") {
            const cleanStr = d.start_date.replace(" ", "T"); // Corrige formato ISO se necessário
            const cleanStr = d.start_date.replace(" ", "T");
            const date = new Date(cleanStr);
            if (!isNaN(date)) start = date;
        }

        // 2. Tratamento de Setores
        const setoresRaw = d.receiver_subcategory || d.receiver_category || "";
        const setoresLimpos = setoresRaw.replace(/[\[\]'"]/g, "").split(/[;,]/)
            .map(s => s.trim())
            .filter(s => s && !ignorar.includes(s));

        // 3. Tratamento de Tipos de Operação
        const opsRaw = d.operation_type || "";
        // O seu CSV original pode ter listas em strings, vamos limpar:
        const opsLimpos = opsRaw.replace(/[\[\]'"]/g, "").split(/[;,]/)
            .map(s => s.trim())
            .filter(s => s && !ignorar.includes(s));

        return {
            id: d.incident_id, // ID real do CSV
            id: d.incident_id,
            data: start,
            ano: start ? start.getFullYear() : null,
            atacante: d.initiator_country || "Unknown",
            vitima: d.receiver_country || "Unknown",
            // Lógica para definir se é Estado ou Hacker (baseada no seu código original)
            tipo_ator: (d.initiator_category || "").toLowerCase().includes("state") && 
                       !(d.initiator_category || "").includes("non-state") ? "Nation-State" : "Non-State / Hacker",
            setor: setoresLimpos[0] || "Unknown",
            tipos_lista: opsLimpos // Lista real de tipos
            tipos_lista: opsLimpos
        };
    }).filter(d => d.data !== null); // Remove linhas sem data válida

    // ... O RESTANTE DO CÓDIGO (Parte 3: Criação dos Gráficos) CONTINUA IGUAL ...
    // (Não precisa mudar nada da parte 3 para baixo, pois já ajustamos as variáveis)
    }).filter(d => d.data !== null);


    // =========================================================================
    // 3. CRIAÇÃO DOS GRÁFICOS
    // =========================================================================

    // Configuração padrão de largura para ficar bonito na coluna
    const widthPadrao = 600; 

    // --- GRÁFICO 1: EVOLUÇÃO TEMPORAL (ID: vis-temporal) ---
    // --- GRÁFICO 1: EVOLUÇÃO TEMPORAL ---
    const dadosPorAno = d3.rollup(dadosConflitos, v => v.length, d => d.ano);
    const timelineData = Array.from(dadosPorAno, ([ano, total]) => ({ano, total}))
        .sort((a, b) => a.ano - b.ano);
@@ -88,13 +76,15 @@ async function main() {
    renderChart("vis-temporal", plotTemporal);


    // --- GRÁFICO 2: MAPA DE VULNERABILIDADE (ID: vis-mapa) ---
    const countries = topojson.feature(worldData, worldData.objects.countries);
    // --- GRÁFICO 2: MAPA DE VULNERABILIDADE ---
    
    // CORREÇÃO 2: Se o arquivo é GeoJSON, usamos direto!
    // Não usamos topojson.feature aqui.
    const countries = worldData; 

    // Contagem por país vítima
    const mapCounts = d3.rollup(dadosConflitos, v => v.length, d => {
        if (d.vitima === "United States") return "United States of America";
        if (d.vitima.includes("Russia")) return "Russian Federation";
        if (d.vitima.includes("Russia")) return "Russian Federation"; 
        return d.vitima;
    });

@@ -108,10 +98,10 @@ async function main() {
            type: "log", 
            label: "Nº de Ataques", 
            legend: true, 
            domain: [1, 500] // Ajuste conforme seus dados reais para o gradiente ficar bom
            domain: [1, 500] 
        },
        marks: [
            Plot.sphere({fill: "#f0f4f8"}), // Cor do oceano suave
            Plot.sphere({fill: "#f0f4f8"}),
            Plot.geo(countries, {
                fill: d => mapCounts.get(d.properties.name),
                stroke: "white",
@@ -125,8 +115,7 @@ async function main() {
    renderChart("vis-mapa", plotMapa);


    // --- GRÁFICO 3: ARSENAL / TIPOS DE ATAQUE (ID: vis-barras) ---
    // Precisamos "explodir" a lista de tipos (um incidente pode ter vários tipos)
    // --- GRÁFICO 3: ARSENAL ---
    const contagemTipos = new Map();
    dadosConflitos.forEach(d => {
        d.tipos_lista.forEach(tipo => {
@@ -136,12 +125,12 @@ async function main() {

    const dadosTipos = Array.from(contagemTipos, ([tipo, valor]) => ({tipo, valor}))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10); // Top 10
        .slice(0, 10);

    const plotTipos = Plot.plot({
        title: "Top 10 Métodos de Ataque",
        width: widthPadrao,
        marginLeft: 200, // Margem grande para ler os nomes
        marginLeft: 200,
        x: { label: "Quantidade", grid: true },
        y: { label: null, domain: dadosTipos.map(d => d.tipo) },
        marks: [
@@ -153,7 +142,7 @@ async function main() {
    renderChart("vis-barras", plotTipos);


    // --- GRÁFICO 4: ORIGEM DOS ATAQUES (ID: vis-origem) ---
    // --- GRÁFICO 4: ORIGEM ---
    const origemCounts = d3.rollup(dadosConflitos, v => v.length, d => d.atacante);
    const dadosOrigem = Array.from(origemCounts, ([pais, valor]) => ({pais, valor}))
        .filter(d => d.pais !== "Unknown")
@@ -174,51 +163,38 @@ async function main() {

    renderChart("vis-origem", plotOrigem);


    // =========================================================================
    // 4. INICIA O SISTEMA DE SCROLL (SCROLLYTELLING)
    // =========================================================================
    // Inicia Scroll
    initScrollama();
}

// Função Auxiliar para colocar o gráfico na tela
// === FUNÇÕES AUXILIARES ===

function renderChart(id, plotElement) {
    const div = document.getElementById(id);
    if (div) {
        div.innerHTML = ""; // Limpa qualquer coisa que tinha antes
        div.innerHTML = "";
        div.append(plotElement);
    } else {
        console.error(`Elemento com ID ${id} não encontrado no HTML.`);
    }
}

// Lógica de Detecção de Rolagem
function initScrollama() {
    const steps = document.querySelectorAll('.step');
    const chartContainers = document.querySelectorAll('.chart-container');

    // Configuração do Observador: dispara quando 50% do texto está visível
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // 1. Pega qual gráfico esse texto quer mostrar
                const targetId = entry.target.getAttribute('data-chart');
                
                // 2. Esconde todos
                chartContainers.forEach(c => c.classList.remove('active'));
                
                // 3. Mostra só o escolhido
                const targetChart = document.getElementById(targetId);
                if (targetChart) {
                    targetChart.classList.add('active');
                }
            }
        });
    }, { threshold: 0.5 }); // 0.5 significa "metade do elemento visível"

    // Manda observar todos os passos de texto
    }, { threshold: 0.5 });
    steps.forEach(step => observer.observe(step));
}

// Roda a função principal
main().catch(err => console.error("Erro ao carregar dados:", err));
