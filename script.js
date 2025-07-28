document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const tickerInput = document.getElementById('tickerInput');
    const fetchDataButton = document.getElementById('fetchDataButton');
    const messageDiv = document.getElementById('message');
    const summaryTableBody = document.getElementById('summaryTableBody');
    const stockDataTableBody = document.getElementById('stockDataTableBody');
    const summaryTable = document.getElementById('summaryTable');
    const detailsTable = document.getElementById('detailsTable');
    const filterRadios = document.querySelectorAll('input[name="filter"]');

    // State variable to hold the complete, unfiltered data
    let fullDataSet = [];

    // --- EVENT LISTENERS ---
    fetchDataButton.addEventListener('click', handleFetchRequest);
    filterRadios.forEach(radio => radio.addEventListener('change', runAnalysis));
    
    // Initial fetch on page load
    handleFetchRequest();

    /**
     * Main handler to fetch data from the API.
     * This is called only when the "Analyze" button is clicked.
     */
    async function handleFetchRequest() {
        const ticker = tickerInput.value.trim().toUpperCase();
        if (!ticker) {
            displayMessage('Please enter a stock ticker.', 'error');
            return;
        }

        displayMessage(`Fetching all weekly data for ${ticker}...`, 'info');
        fullDataSet = []; // Clear old data
        
        try {
            // Fetch data and store it in our state variable
            fullDataSet = await fetchYahooData(ticker);
            // Run the analysis with the newly fetched data
            runAnalysis(); 
        } catch (error) {
            console.error('Error in handleFetchRequest:', error);
            displayMessage(error.message, 'error');
        }
    }

    /**
     * Runs the entire analysis pipeline on the current dataset based on the selected filter.
     * This is called after fetching data OR when a filter is changed.
     */
    function runAnalysis() {
        if (fullDataSet.length === 0) {
            displayMessage('No data available. Please fetch data for a ticker.', 'info');
            return;
        }

        displayMessage('Applying filters and calculating statistics...', 'info');
        summaryTableBody.innerHTML = '';
        stockDataTableBody.innerHTML = '';

        const filteredData = applyFilter(fullDataSet);

        if (filteredData.length === 0) {
            displayMessage('No data matches the selected filter.', 'info');
            return;
        }

        const summaryStats = calculateSummaryStatistics(filteredData);
        
        populateDetailsTable(filteredData);
        populateSummaryTable(summaryStats);

        makeTableSortable(detailsTable);
        makeTableSortable(summaryTable);
        
        displayMessage('', ''); // Clear message on success
    }

    /**
     * Filters the full dataset based on the currently selected radio button.
     * @param {Array} data - The complete, unfiltered dataset.
     * @returns {Array} The filtered dataset.
     */
    function applyFilter(data) {
        const filterValue = document.querySelector('input[name="filter"]:checked').value;
        
        if (filterValue === 'all') {
            return data;
        }

        const filtered = [];
        // Start from the second item since the first has no preceding week
        for (let i = 1; i < data.length; i++) {
            const previousWeekReturn = data[i-1].weeklyReturn;
            if (filterValue === 'after-up' && previousWeekReturn > 0) {
                filtered.push(data[i]);
            } else if (filterValue === 'after-down' && previousWeekReturn < 0) {
                filtered.push(data[i]);
            }
        }
        return filtered;
    }

    /**
     * Fetches and processes data from the Yahoo Finance endpoint.
     * Returns data sorted from OLDEST to NEWEST.
     */
    async function fetchYahooData(ticker) {
        // ... (This function remains the same as before, but ensure it returns data oldest-to-newest for the filter logic)
        const period1 = 0;
        const period2 = Math.floor(Date.now() / 1000);
        const yahooEndpoint = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1wk&events=history`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(yahooEndpoint)}`;

        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Proxy server error: ${response.status}`);
        const chartData = await response.json(); 
        if (chartData.chart.error) throw new Error(`Yahoo Finance error: ${chartData.chart.error.description}`);

        const result = chartData.chart.result[0];
        const timestamps = result.timestamp;
        if (!timestamps) return [];
        const quotes = result.indicators.quote[0];

        const processedData = [];
        for (let i = 0; i < timestamps.length; i++) {
            const open = quotes.open[i];
            const close = quotes.close[i];
            if (open === null || close === null || open === 0) continue;
            const date = new Date(timestamps[i] * 1000);
            processedData.push({
                date: date,
                open: open,
                close: close,
                weekNumber: getSimpleWeekNumber(date),
                weeklyReturn: (close - open) / open
            });
        }
        return processedData; // Returned sorted oldest to newest
    }

    /**
     * Aggregates weekly data and computes statistics.
     */
    function calculateSummaryStatistics(data) {
        // ... (This function is updated to calculate Win Rate)
        const weeklyGroups = {};
        data.forEach(d => {
            if (!weeklyGroups[d.weekNumber]) {
                weeklyGroups[d.weekNumber] = { returns: [] };
            }
            weeklyGroups[d.weekNumber].returns.push(d.weeklyReturn);
        });

        const summary = {};
        for (const weekNum in weeklyGroups) {
            const returns = weeklyGroups[weekNum].returns;
            const count = returns.length;
            if (count === 0) continue;

            const positiveTrades = returns.filter(r => r > 0).length;
            const winRate = positiveTrades / count;

            const sum = returns.reduce((a, b) => a + b, 0);
            const avgReturn = sum / count;
            const stdDev = Math.sqrt(returns.map(x => Math.pow(x - avgReturn, 2)).reduce((a, b) => a + b, 0) / count);
            const gains = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
            const losses = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
            const profitFactor = losses === 0 ? Infinity : gains / losses;
            const sharpeRatio = stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(52);

            summary[weekNum] = {
                count, winRate, avgReturn, profitFactor, sharpeRatio, stdDev,
                maxReturn: Math.max(...returns),
                minReturn: Math.min(...returns)
            };
        }
        return summary;
    }

    /**
     * Populates the summary statistics table.
     */
    function populateSummaryTable(summaryStats) {
        // ... (This function is updated to add the new column's data)
        for (let i = 1; i <= 53; i++) {
            const stats = summaryStats[i];
            if (!stats) continue;
            const row = summaryTableBody.insertRow();
            row.insertCell().textContent = i;
            row.insertCell().textContent = stats.count;
            // New % Profitable cell
            const winRateCell = row.insertCell();
            winRateCell.textContent = `${(stats.winRate * 100).toFixed(1)}%`;
            winRateCell.className = stats.winRate >= 0.5 ? 'positive' : 'negative';
            
            const avgReturnCell = row.insertCell();
            avgReturnCell.textContent = `${(stats.avgReturn * 100).toFixed(2)}%`;
            avgReturnCell.className = stats.avgReturn >= 0 ? 'positive' : 'negative';
            
            row.insertCell().textContent = isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞';
            row.insertCell().textContent = stats.sharpeRatio.toFixed(2);
            row.insertCell().textContent = (stats.stdDev * 100).toFixed(2) + '%';
            
            const maxCell = row.insertCell();
            maxCell.textContent = `${(stats.maxReturn * 100).toFixed(2)}%`;
            maxCell.className = 'positive';
            const minCell = row.insertCell();
            minCell.textContent = `${(stats.minReturn * 100).toFixed(2)}%`;
            minCell.className = 'negative';
        }
    }

    /**
     * Populates the details table. Now displays newest-first.
     */
    function populateDetailsTable(data) {
        const displayData = [...data].reverse(); // Display newest data first
        displayData.forEach(d => {
            const row = stockDataTableBody.insertRow();
            row.insertCell().textContent = d.weekNumber;
            row.insertCell().textContent = d.date.toISOString().split('T')[0];
            row.insertCell().textContent = `$${d.open.toFixed(2)}`;
            row.insertCell().textContent = `$${d.close.toFixed(2)}`;
            const percentCell = row.insertCell();
            percentCell.textContent = `${(d.weeklyReturn * 100).toFixed(2)}%`;
            percentCell.className = d.weeklyReturn >= 0 ? 'positive' : 'negative';
        });
    }

    // --- UTILITY AND HELPER FUNCTIONS (UNCHANGED) ---
    function makeTableSortable(table) {
        const headers = table.querySelectorAll('th');
        headers.forEach((header, index) => {
            header.addEventListener('click', () => {
                const isAsc = header.classList.contains('sort-asc');
                const direction = isAsc ? -1 : 1;
                const tbody = table.querySelector('tbody');
                const rows = Array.from(tbody.querySelectorAll('tr'));
                const sortedRows = rows.sort((a, b) => {
                    let valA = a.querySelector(`td:nth-child(${index + 1})`).textContent;
                    let valB = b.querySelector(`td:nth-child(${index + 1})`).textContent;
                    const numA = parseFloat(valA.replace(/[^0-9.-]+/g, ""));
                    const numB = parseFloat(valB.replace(/[^0-9.-]+/g, ""));
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return (numA - numB) * direction;
                    } else {
                        return valA.localeCompare(valB) * direction;
                    }
                });
                headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
                header.classList.toggle('sort-asc', !isAsc);
                header.classList.toggle('sort-desc', isAsc);
                sortedRows.forEach(row => tbody.appendChild(row));
            });
        });
    }

    function getSimpleWeekNumber(date) {
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        const currentInstance = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const diff = currentInstance - yearStart;
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = Math.floor(diff / oneDay);
        return Math.ceil((dayOfYear + 1) / 7);
    }

    function displayMessage(msg, type) {
        messageDiv.textContent = msg;
        messageDiv.className = `message ${type}`;
    }
});
