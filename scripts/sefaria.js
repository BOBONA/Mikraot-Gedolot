const API = "https://www.sefaria.org/api/";
const INDEX_LOC = "./resources/sefaria.json";
const LOG_FUNC = err => console.log(err);

// An index that contains every text's categories, title, and heTitle
let index = [];
let cached = {
    index: {},
    source: {},
    pastQueries: {},
};
let returnFunction = LOG_FUNC; // for default

// Takes a sefaria index object and creates a more concise version
function generateIndex(sefariaIndex) {
    let generated = [];
    while (sefariaIndex.length > 0) {
        let item = sefariaIndex.splice(0, 1)[0];
        if (item.contents === undefined) {
            let record = {
                categories: item.categories || [],
            }
            record.searchString = record.categories.join("");
            record.isCommentator = item.commentator !== undefined;
            record.title = item.title;
            record.hebrewTitle = item.heTitle;
            record.searchString += record.title + record.hebrewTitle;
            if (record.isCommentator) {
                record.commentator = item.commentator;
                record.hebrewCommentator = item.heCommentator;
                record.searchString += record.commentator + record.hebrewCommentator;
            } 
            record.searchString = record.searchString.toLowerCase();
            generated.push(record);
        } else {
            sefariaIndex.push(...item.contents);
        }
    }
    return generated;
}

// Initialize relevant data in this file, requires a function to be called on API responses
function initializeAPI(onResponseFunc) {
    returnFunction = onResponseFunc;
    axios.get(INDEX_LOC).then(function (res) {
        index = res.data;
    }).catch(LOG_FUNC);
}

// Fetches a Sefaria text from its reference
function fetchReference(ref) {
    axios.get(API + `texts/${ref}`).then(function (res) {
        returnFunction(res.data);
    }).catch(LOG_FUNC);
}

function addIndexFlag(array) {
    for (let i = 0; i < array.length; i++) {
        array[i].indexFlag = i;
    }
}

// Returns a list of matching texts from the index. Results that contain the string in the actual title are prioritized.
// TODO allow for multi string searches 
function searchIndex(string) {
    let results = index.filter(item => item.searchString.includes(string));
    // Precomputes whether the record includes the string in its title
    for (let i = 0; i < results.length; i++) {
        let result = results[i];
        result.tempSearchFlag = result.title.toLowerCase().includes(string);
    }
    // Uses an index flag to stable sort
    results.sort((a, b) => a.title.localeCompare(b.title)); // Sort alphabetically
    addIndexFlag(results);
    results.sort((a, b) => { // Sort by length of title
        let comp = a.title.length - b.title.length;
        if (comp === 0) {
            return a.indexFlag - b.indexFlag;
        }
        return comp;
    });
    addIndexFlag(results);
    results.sort((a, b) => { // Sort by whether title contains string
        let comp = b.tempSearchFlag - a.tempSearchFlag;
        if (comp === 0) {
            return a.indexFlag - b.indexFlag;
        }
        return comp;
    });
    return results;
}

// Returns the relevant data from a more deailed Sefaria index listing
async function fetchDetailedIndex(ref) {
    if (cached.index[ref] !== undefined) {
        return cached.index[ref];
    }
    let res = await axios.get(`${API}index/${ref}`);
    let response = res.data;
    let indexEntry = {};
    indexEntry.multiSection = response.schema.nodes !== undefined;
    indexEntry.depth = (response.schema.nodes === undefined ? response.schema.depth :
                        response.schema.nodes[0].depth) || 2;
    if (indexEntry.multiSection) {
        indexEntry.title = [];
        indexEntry.hebrewTitle = [];
        if (response.base_text_titles !== undefined) {
            indexEntry.baseTexts = [];
            indexEntry.hebrewBaseTexts = [];
        }
        for (n in response.schema.nodes) {
            let node = response.schema.nodes[n];
            indexEntry.title.push(node.title);
            indexEntry.hebrewTitle.push(node.heTitle);
            if (indexEntry.baseTexts !== undefined) {
                indexEntry.baseTexts.push(response.base_text_titles[n].en);
                indexEntry.hebrewBaseTexts.push(response.base_text_titles[n].he);
            }
            if (ref.includes(node.title) || ref.includes(node.heTitle)) {
                indexEntry.sectionIndex = n;
            }
        }
    } else {
        indexEntry.title = response.schema.title;
        indexEntry.hebrewTitle = response.schema.heTitle;
        if (response.base_text_titles != undefined) {
            indexEntry.baseTexts = response.base_text_titles[0].en;
            indexEntry.hebrewBaseTexts = response.base_text_titles[0].he;
        }
    }
    cached.index[ref] = indexEntry;
    return indexEntry;
}

// Gets a list of sources from the cache that are within a range
function getRangeFromCache(ref, range) {
    let end = range.end.length === 0 ? range.start : range.end;
    let arrays = ["hebrew", "english"];
    let result = {};
    for (let a in arrays) {
        let array = arrays[a];
        let cache = cached.source[ref][array] || [];
        cache.sort((a, b) => compareLocations(a.location, b.location));
        result[array] = [];
        for (let i in cache) {
            let textLoc = cache[i].location;
            // Check that location is within bounds
            if (compareLocations(range.start, textLoc) <= 0 && compareLocations(textLoc, end) <= 0) {
                result[array].push(cache[i]);
            }
        }
    }
    return result;
}


// Processes a rangeString into a standardized format
function processRangeString(rangeString, limit=100) {
    let result = [];
    let ranges = rangeString.split(",");
    for (let r in ranges) {
        let range = ranges[r];
        let rangeEntry = {
            start: [],
            end: [],
        };
        let parts = range.split("-");
        let left = parts[0].split(".");
        for (let l in left) {
            let part = parseInt(left[l]);
            rangeEntry.start.push(isNaN(part) ? 1 : part);
        }
        if (parts.length > 1) {
            let right = parts[1].split(".");
            for (let r in right) {
                let part = parseInt(right[r]);
                rangeEntry.end.push(isNaN(part) ? 1 : part);
            }
        }
        result.push(rangeEntry);
    }
    return result;
}

function getRangeString(range) {
    let start = [];
    let end = [];
    for (let i = 0; i < Math.max(range.start.length, range.end.length); i++) {
        start.push(range.start[i] || 1);
        end.push(range.end[i] || 1);
    }
    let string = start.join(".");
    if (range.end.length > 0) {
        string += `-${end.join(".")}`;
    }
    return string;
}

function compareLocations(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] > b[i]) {
            return 1;
        } else if (a[i] < b[i]) {
            return -1;
        }
    }
    return 0;
}

// a recursive procedure for building an array of verses with their locations
// the array is processed into the container, each location begins with pointer, depth and queryStart are used because of Sefaria's variable responses
function processTextArray(container, array, pointer, depth, queryStart) {
    for (let e in array) {
        let loc = parseInt(e) + 1;
        if (pointer.length + 2 === depth) { // finnicky way of checking
            loc = (queryStart[pointer.length] || 1) + parseInt(e);
        }
        let updated = [...pointer, loc];
        let el = array[e];
        if (typeof el === "string") {
            container.push({index: updated.join("."), location: updated, data: el});
        } else {
            processTextArray(container, el, updated, depth, queryStart);
        }
    }
}

// Adds a source to the data cache
async function fetchSource(ref, range) {
    let refIndex = await fetchDetailedIndex(ref);
    let query = `${API}texts/${ref} ${getRangeString(range, refIndex.depth)}`;
    if (cached.pastQueries[query] === undefined) {
        let data = (await axios.get(`${query}?pad=0`)).data;
        if (cached.source[ref] === undefined) {
            cached.source[ref] = {hebrew: [], english: []};
        }
        let hiddenLocation = []; // What to prepend to the data entries that Sefaria returns, depending on the range
        for (let i in range.start) {
            if (range.start[i] === undefined) {
                break;
            }
            if (range.start[i] === (range.end[i] || range.start[i])) {
                hiddenLocation.push(range.start[i]);
            }
        }
        processTextArray(cached.source[ref].hebrew, data.he, hiddenLocation, refIndex.depth, range.start);
        processTextArray(cached.source[ref].english, data.text, hiddenLocation, refIndex.depth, range.start);
    }
    cached.pastQueries[query] = true;
    return getRangeFromCache(ref, range);
}

// This returns an index entry without the multi flag to consider
async function nonMulti(ref) {
    let entry = Object.assign({}, await fetchDetailedIndex(ref));
    if (entry.multiSection) {
        let index = entry.sectionIndex || 0;
        entry.title = entry.title[index];
        entry.hebrewTitle = entry.hebrewTitle[index];
        entry.baseTexts = entry.baseTexts[index];
        entry.hebrewBaseTexts = entry.hebrewBaseTexts[index];
    }
    return entry;
}

// Checks if a commentary descends from a base text
async function hasBaseText(commentary, base) {
    let c = await nonMulti(commentary);
    let b = await nonMulti(base);
    if (c.baseTexts === undefined) {
        return false;
    } else if (c.baseTexts === b.title) {
        return true;
    } else {
        return hasBaseText(c.baseTexts, base);
    }
}
