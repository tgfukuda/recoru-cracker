const puppeteer = require('puppeteer');

const PAGE_WAITING_MS = Number(process.env.PAGE_WAITING_MS) || 2000;
const INTERACTION_WAITING_MS = Number(process.env.INTERACTION_WAITING_MS) || 500;

async function getAttendanceRows(page) {
    try {
        // テーブルが読み込まれるまで待機
        await page.waitForSelector('table.attendance-table');

        // 全ての行を取得
        const rows = await page.evaluate(() => {
            const trs = document.querySelectorAll('table.attendance-table tbody tr');
            return Array.from(trs).map(tr => {
                return {
                    date: tr.querySelector('td.date-cell')?.textContent.trim(),
                    dayOfWeek: tr.querySelector('td.day-of-week-cell')?.textContent.trim(),
                    startTime: tr.querySelector('td.start-time-cell')?.textContent.trim(),
                    endTime: tr.querySelector('td.end-time-cell')?.textContent.trim(),
                    status: tr.querySelector('td.status-cell')?.textContent.trim()
                };
            });
        });

        console.log('取得した行数:', rows.length);
        console.log('最初の行のデータ:', rows[0]);
        
        return rows;

    } catch (error) {
        console.error('行の取得に失敗しました:', error);
        throw error;
    }
}

async function delay(page, ms) {
    await page.evaluate(ms => {
        return new Promise(resolve => setTimeout(resolve, ms));
    }, ms);
}

async function clickErrorRows(page) {
    try {
        try {
            await page.waitForSelector('td.item-attendKbn.bg-err.tip', { timeout: 5000 });
        } catch (e) {
            console.log('エラー行が見つかりません');
            return;
        }
        let processedCount = 0;

        while (true) {
            // エラー行を取得
            const errorCells = await page.$$('td.item-attendKbn.bg-err.tip');
            if (errorCells.length === 0) {
                // 現在のスクロール位置を取得
                const currentHeight = await page.evaluate(() => document.documentElement.scrollTop);
                
                // スクロールして新しい行を表示
                await page.evaluate(() => {
                    window.scrollBy(0, 200); // 200pxずつスクロール
                });
                await delay(page, INTERACTION_WAITING_MS);

                // 新しいエラー行を待つ
                try {
                    await page.waitForSelector('td.item-attendKbn.bg-err.tip', { timeout: 3000 });
                } catch (e) {
                    // タイムアウトした場合、スクロール位置が変わっていなければ終了
                    const newHeight = await page.evaluate(() => document.documentElement.scrollTop);
                    if (newHeight === currentHeight) {
                        console.log('これ以上エラー行が見つかりません');
                        break;
                    }
                }
                continue;
            }

            // 最初のエラー行を処理
            await errorCells[0].click();
            await delay(page, INTERACTION_WAITING_MS);
            
            // 以下、既存の処理
            await page.waitForSelector('select#chartDto\\.attendanceDtos\\[0\\]\\.attendId', {
                visible: true,
                timeout: 5000
            });

            await page.select(
                'select#chartDto\\.attendanceDtos\\[0\\]\\.attendId',
                '1'
            );
            await delay(page, INTERACTION_WAITING_MS);

            const startTimeSelector = 'input#chartDto\\.attendanceDtos\\[0\\]\\.worktimeStart';
            await page.waitForSelector(startTimeSelector, { visible: true });
            await page.$eval(startTimeSelector, el => el.value = '');
            await page.type(startTimeSelector, String('09:00'));
            await delay(page, INTERACTION_WAITING_MS);

            const endTimeSelector = 'input#chartDto\\.attendanceDtos\\[0\\]\\.worktimeEnd';
            await page.waitForSelector(endTimeSelector, { visible: true });
            await page.$eval(endTimeSelector, el => el.value = '');
            await page.type(endTimeSelector, String('18:00'));
            await delay(page, INTERACTION_WAITING_MS);

            page.once('dialog', async dialog => {
                console.log('アラートメッセージ:', dialog.message());
                await dialog.accept();
            });

            await page.click('input#UPDATE-BTN');
            await delay(page, PAGE_WAITING_MS);

            processedCount++;
            console.log(`${processedCount}件目の更新が完了しました`);
        }

        console.log(`全${processedCount}件の処理が完了しました`);

    } catch (error) {
        console.error('処理に失敗しました:', error);
        throw error;
    }
}

async function goToPreviousMonth(page) {
    try {
        // ボタンが表示されるまで待機
        await page.waitForSelector('select#periodPoint');
        await page.select(
            'select#periodPoint',
            '-1'
        );

        // ページの更新を待つ
        await delay(page, PAGE_WAITING_MS);
        console.log('前月へ移動しました');
    } catch (error) {
        console.error('前月への移動に失敗しました:', error);
        throw error;
    }
}

async function automateRecoru(authId, password, contractId) {
    const browser = await puppeteer.launch({
        headless: !!process.env.HEADLESS,
        slowMo: 10,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // ログインページにアクセス
        await page.goto('https://app.recoru.in/ap/login');
        
        await page.waitForSelector('input[id="contractId"]', { visible: true });
        // ログイン情報入力
        await page.type('input[id="contractId"]', contractId);
        await page.type('input[id="authId"]', authId);
        await page.type('input[id="password"]', password);
        await page.click('input.common-btn.submit');

        await delay(page, PAGE_WAITING_MS);
        
        // 前月へ移動
        if (process.env.PREV_MONTH === 'true') {
            await goToPreviousMonth(page);
            await delay(page, PAGE_WAITING_MS);
        }

        // エラー行をクリック
        await clickErrorRows(page);

    } catch (error) {
        console.error('エラーが発生しました:', error);
        throw error;
    }

    await browser.close();
}

module.exports = {
    automateRecoru,
    getAttendanceRows,
    clickErrorRows
}; 