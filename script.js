document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    // IMPORTANT: Replace this with your NEW, secret Tiingo API key.
    const TIINGO_API_KEY = 'PASTE_YOUR_NEW_TIINGO_API_KEY_HERE';

    // --- DOM Elements ---
    const tickerInput = document.getElementById('tickerInput');
    const fetchDataButton = document.getElementById('fetchDataButton');
    const messageDiv = document.getElementById('message');
    const summaryTableBody = document.getElementById('summaryTableBody');
    const stockDataTableBody = document.getElementById('stockDataTableBody');
    const summaryTable = document.getElementById('summaryTable');
    const detailsTable = document.getElementById('detailsTable');
    const filterRadios = document.querySelectorAll('input[name="filter"]');

    let fullDataSet = [];

    // --- EVENT LISTENERS ---
    fetchDataButton.addEventListener('click', handleFetchRequest);
    filterRadios.forEach(radio => radio.addEventListener('change', runAnalysis));
    
    // Initial check for API Key
    if (TIINGO_API_KEY === 'PASTE_YOUR_NEW_TIINGO_API_KEY_HERE') {
        displayMessage('ERROR: Please update the TIINGO_API_KEY in script.js', 'error');
    } else {
        handleFetchRequest(); // Initial fetch on page load
    }

    /**
     * Main handler to fetch data from the API.
     */
    async function handleFetchRequest() {
        const ticker = tickerInput.value.trim().toUpperCase();
        if (!ticker) {
            displayMessage('Please enter a stock ticker.', 'error');
            return;
        }
        displayMessage(`Fetching all weekly data for ${ticker} from Tiingo...`, 'info');
        fullDataSet = [];
        
        try {
            fullDataSet = await fetchTiingoData(ticker);
            runAnalysis(); 
        } catch (error) {
            console.error('Error in handleFetchRequest:', error);
            displayMessage(error.message, 'error');
            summaryTableBody.innerHTML = '';
            stockDataTableBody.innerHTML = '';
        }
    }

    /**
     * Runs the entire analysis pipeline based on the selected filter.
     */
    function runAnalysis() {
        if (fullDataSet.length === 0) { return; }
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
        displayMessage('', '');
    }
    
    /**
     * Filters the full dataset based on the currently selected radio button.
     */
    function applyFilter(data) {
        const filterValue = document.querySelector('input[name="filter"]:checked').value;
        if (filterValue === 'all') return data;
        const filtered = [];
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

    // =========================================================================
    // === THIS IS THE FINAL, CORRECTED FUNCTION FOR THE TIINGO API ===
    // =========================================================================
    /**
     * Fetches and processes weekly data directly from Tiingo using header authentication.
     * @param {string} ticker The stock ticker symbol.
     * @returns {Promise<Array>} A promise that resolves to an array of processed weekly data.
     */
    async function fetchTiingoData(ticker) {
        const startDate = '1970-01-01'; 
        // Note: The token is NOT in the URL anymore.
        const tiingoUrl = `https://api.tiingo.com/tiingo/daily/${ticker}/prices?startDate=${startDate}&resampleFreq=weekly`;

        // We create a headers object to pass our API key securely.
        const headers = {
            'Content-Type': 'application/json',
            // This is the correct way to authorize with the Tiingo API.
            'Authorization': `Token ${TIINGO_API_KEY}` 
        };

        // We make the fetch call directly, with no proxy, passing the headers object.
        const response = await fetch(tiingoUrl, { headers: headers });
        const data = await response.json();

        // Error handling is more direct and reliable now.
        if (!response.ok) {
            throw new Error(`Tiingo API Error: ${data.detail || 'Could not fetch data. Check ticker and API key.'}`);
        }

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('No data returned from Tiingo. The ticker may be invalid.');
        }

        const processedData = [];
        for (const weekData of data) {
            const open = weekData.open;
            const close = weekData.close;
            if (open === null || close === null || open === 0) continue;
            const date = new Date(weekData.date);
            processedData.push({
                date: date,
                open: open,
                close: close,
                weekNumber: getSimpleWeekNumber(date),
                weeklyReturn: (close - open) / open
            });
        }
        return processedData;
    }
    
    //
    // All functions below this line are correct and unchanged.
    //
    
    function calculateSummaryStatistics(data) {
        const weeklyGroups = {};
        data.forEach(d => {
            if (!weeklyGroups[d.weekNumber]) weeklyGroups[d.weekNumber] = { returns: [] };
            weeklyGroups[d.weekNumber].returns.push(d.weeklyReturn);
        });
        const summary = {};
        for (const weekNum in weeklyGroups) {
            const returns = weeklyGroups[weekNum].returns;
            const count = returns.length;
            if (count === 0) continue;
            const winRate = returns.filter(r => r > 0).length / count;
            const sum = returns.reduce((a, b) => a + b, 0);
            const avgReturn = sum / count;
            const stdDev = Math.sqrt(returns.map(x => Math.pow(x - avgReturn, 2)).reduce((a, b) => a + b, 0) / count);
            const gains = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
            const losses = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
            const profitFactor = losses === 0 ? Infinity : gains / losses;
            const sharpeRatio = stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(52);
            summary[weekNum] = { count, winRate, avgReturn, profitFactor, sharpeRatio, stdDev, maxReturn: Math.max(...returns), minReturn: Math.min(...returns) };
        }
        return summary;
    }

    function populateSummaryTable(summaryStats) {
        for (let i = 1; i <= 53; i++) {
            const stats = summaryStats[i];
            if (!stats) continue;
            const row = summaryTableBody.insertRow();
            row.insertCell().textContent = i;
            row.insertCell().textContent = stats.count;
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

    function populateDetailsTable(data) {
        const displayData = [...data].reverse();
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
