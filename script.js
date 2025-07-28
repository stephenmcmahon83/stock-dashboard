document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const tickerInput = document.getElementById('tickerInput');
    const fetchDataButton = document.getElementById('fetchDataButton');
    const messageDiv = document.getElementById('message');
    const summaryTableBody = document.getElementById('summaryTableBody');
    const stockDataTableBody = document.getElementById('stockDataTableBody');
    const summaryTable = document.getElementById('summaryTable');
    const detailsTable = document.getElementById('detailsTable');

    // Event Listeners
    fetchDataButton.addEventListener('click', handleFetchRequest);
    
    // Initial fetch on page load
    handleFetchRequest();

    /**
     * Main handler to orchestrate the fetching and processing.
     */
    async function handleFetchRequest() {
        const ticker = tickerInput.value.trim().toUpperCase();
        if (!ticker) {
            displayMessage('Please enter a stock ticker.', 'error');
            return;
        }

        displayMessage(`Fetching all weekly data for ${ticker}...`, 'info');
        summaryTableBody.innerHTML = '';
        stockDataTableBody.innerHTML = '';

        try {
            const rawData = await fetchYahooData(ticker);
            if (!rawData || rawData.length === 0) {
                displayMessage(`No weekly data found for ${ticker}. It may be an invalid ticker.`, 'info');
                return;
            }

            displayMessage('Calculating statistics...', 'info');
            const summaryStats = calculateSummaryStatistics(rawData);
            
            populateDetailsTable(rawData);
            populateSummaryTable(summaryStats);

            makeTableSortable(detailsTable);
            makeTableSortable(summaryTable);
            
            displayMessage('', ''); // Clear message on success
        } catch (error) {
            console.error('Error in handleFetchRequest:', error);
            displayMessage(error.message, 'error');
        }
    }

    /**
     * Fetches and processes data from the Yahoo Finance endpoint.
     * @param {string} ticker The stock ticker symbol.
     * @returns {Promise<Array>} A promise that resolves to an array of processed weekly data.
     */
    async function fetchYahooData(ticker) {
        const period1 = 0; // Start of Unix time to get all data
        const period2 = Math.floor(Date.now() / 1000);
        const yahooEndpoint = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1wk&events=history`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(yahooEndpoint)}`;

        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Proxy server error: ${response.status}`);

        const data = await response.json();
        const chartData = JSON.parse(data.contents);

        if (chartData.chart.error) throw new Error(`Yahoo Finance error: ${chartData.chart.error.description}`);

        const result = chartData.chart.result[0];
        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];

        if (!timestamps) return []; // Handle cases where a ticker is valid but has no data

        const processedData = [];
        for (let i = 0; i < timestamps.length; i++) {
            const open = quotes.open[i];
            const close = quotes.close[i];

            if (open === null || close === null || open === 0) continue;

            const date = new Date(timestamps[i] * 1000);
            const weeklyReturn = (close - open) / open;

            processedData.push({
                date: date,
                open: open,
                close: close,
                weekNumber: getSimpleWeekNumber(date),
                weeklyReturn: weeklyReturn
            });
        }
        return processedData;
    }

    /**
     * Aggregates weekly data and computes statistics for each week of the year.
     * @param {Array} rawData - The array of processed weekly data.
     * @returns {Object} An object containing statistics for each week number.
     */
    function calculateSummaryStatistics(rawData) {
        const weeklyGroups = {};

        rawData.forEach(d => {
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

            const sum = returns.reduce((a, b) => a + b, 0);
            const avgReturn = sum / count;

            const stdDev = Math.sqrt(returns.map(x => Math.pow(x - avgReturn, 2)).reduce((a, b) => a + b, 0) / count);

            const gains = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
            const losses = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
            const profitFactor = losses === 0 ? Infinity : gains / losses;

            // Simple Sharpe Ratio (Risk-Free Rate = 0), annualized
            const sharpeRatio = stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(52);

            summary[weekNum] = {
                count,
                avgReturn,
                profitFactor,
                sharpeRatio,
                stdDev,
                maxReturn: Math.max(...returns),
                minReturn: Math.min(...returns)
            };
        }
        return summary;
    }

    /**
     * Populates the main details table with historical data.
     */
    function populateDetailsTable(rawData) {
        const displayData = [...rawData].reverse(); // Display newest data first
        
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

    /**
     * Populates the summary statistics table.
     */
    function populateSummaryTable(summaryStats) {
        for (let i = 1; i <= 53; i++) {
            const stats = summaryStats[i];
            if (!stats) continue;

            const row = summaryTableBody.insertRow();
            row.insertCell().textContent = i;
            row.insertCell().textContent = stats.count;
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
     * Makes a given HTML table sortable.
     */
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

    // --- HELPER FUNCTIONS ---

    /**
     * THE CORRECTED FUNCTION
     * Calculates a simple week number (1-53) for a given Date object, using UTC to avoid timezone errors.
     * @param {Date} date - The date object.
     * @returns {number} The week number.
     */
    function getSimpleWeekNumber(date) {
        // To avoid timezone bugs, we perform all calculations using UTC components.
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
