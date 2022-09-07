import NodeCache from 'node-cache';
import PageData from '../models/page.js';
import Pages from '../controllers/pages.js';
import urlify from '../utils/urlify.js';
import Page from '../models/page.js';

const globalWords: { [key: string]: {[key: string]: number} } = Object.create(null);
let globalPages: PageData[] = [];

class Search {
  // private words: { [key: string]: {[key: string]: number} } = Object.create(null);
  // private pages: PageData[] = [];
  // private cache: NodeCache = new NodeCache();

  public async init() {
    if (globalWords && Object.keys(globalWords).length) {
      return Promise.resolve();
    }

    globalPages = await this.getPages();

    /**
     * Process all pages
     */
    for await (const page of globalPages) {
      /**
       * Read content blocks from page
       */
      for await (const block of page.body.blocks) {
        const blockRatio = this.getBlockRatio(block);
        const blockContent = this.getCleanTextFromBlock(block);
        const blockWords: string[] = this.splitTextToWords(blockContent);

        /**
         * Process list of words in a block
         */
        for await (const word of blockWords) {
          if (!globalWords[word]) {
            globalWords[word] = Object.create(null);
          }

          if (page._id) {
            if (!globalWords[word][page._id]) {
              globalWords[word][page._id] = 0;
            }

            /**
             * Add page id to the list of pages with this word
             */
            globalWords[word][page._id] += blockRatio;
          }
        }
      }
    }

    console.log('Done');
  }

  public async query(searchString: string) {
    await this.init();

    const searchWords = this.splitTextToWords(searchString);

    const goodPages = (await this.getPagesByWords(searchWords))
      .slice(0, 10);

    const returnPages: {[key: string]: string|number, ratio: number}[] = [];

    goodPages.forEach(({ pageId, ratio }) => {
      const page = globalPages.filter(page => page._id === pageId).pop();

      if (!page) {
        return;
      }

      let section = '';

      page.body.blocks.forEach((block: any) => {
        let koef = 1;

        let blockContent = this.getCleanTextFromBlock(block);

        let shortBody = blockContent;

        if (block.type === 'header') {
          section = blockContent;
        }

        searchWords.forEach(word => {
          if (blockContent.toLowerCase().indexOf(word) !== -1) {
            koef *= 10;
          }
        })

        shortBody = this.highlightSubstring(shortBody, searchWords);

        if (koef > 0) {
          returnPages.push({
            ...page,
            shortBody,
            anchor: urlify(section),
            section,
            ratio: ratio * koef,
          })
        }
      });
    });

    return {
      suggestions: [],
      pages: returnPages
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, 15)
    }
  }

  private async getPages(): Promise<Page[]> {
    const pages = await Pages.getAll();

    return pages;

    // let pages: Page[] | undefined = this.cache.get("SEARCH:PAGES");
    //
    // if ( pages === undefined ) {
    //   console.log('cache for SEARCH:PAGES is missing')
    //
    //   pages = await Pages.getAll();
    //
    //   this.cache.set("SEARCH:PAGES", pages);
    // } else {
    //   console.log('wow SEARCH:PAGES is cached')
    // }
    //
    // return pages;
  }

  private async getPagesByWords(words: string[]) {
    const pagesList: {[key: string]: number} = {};

    const validWords = Object.keys(globalWords)
      .filter(word => {
        return !!words.filter(searchWord => word.indexOf(searchWord) !== -1).length
      });

    validWords.forEach(word => {
      Object.keys(globalWords[word])
        .forEach(pageId => {
          if (!pagesList[pageId]) {
            pagesList[pageId] = 0;
          }

          pagesList[pageId] += globalWords[word][pageId]
        })
    })

    const sortedPagesList = Object.keys(pagesList)
      .map(pageId => {
        return {
          pageId,
          ratio: pagesList[pageId]
        }
      })
      .sort((a, b) => b.ratio - a.ratio);

    return sortedPagesList;
  }

  private getUnique(elements: string[]) {
    return [...new Set(elements)].sort();
  }

  private getBlockRatio(block: any) {
    switch (block.type) {
      case 'header':
        if (block.data.level === 1) {
          return 16;
        } else {
          return 2;
        }

      case 'paragraph':
        return 1.1;

      case 'list':
        return 1;

      default:
        return 0;
    }
  }

  private getCleanTextFromBlock(block: any): string {
    let blockContent = '';

    switch (block.type) {
      case 'header':
        blockContent = block.data.text;
        break;

      case 'paragraph':
        blockContent = block.data.text
        break;

      case 'list':
        blockContent = block.data.items.join(' ');
        break;

      default:
        return blockContent;
    }

    blockContent = this.removeHTMLTags(blockContent);
    blockContent = this.removeHTMLSpecialCharacters(blockContent);

    return blockContent;
  }

  private removeHTMLTags(text: string) {
    return text.replace(/<[^>]*>?/gm, '');
  }

  private removeHTMLSpecialCharacters(text: string) {
    return text.replace(/&[^;]*;?/gm, '');
  }

  private splitTextToWords(text: string): string[] {
    return text
      // lowercase all words
      .toLowerCase()

      // remove punctuation
      .replace(/[.,;:]/gi, '')

      // left only letters (+cyrillic) and numbers
      .replace(/[^a-zа-я0-9]/gi, ' ')

      // remove multiple spaces
      .replace(/\s+/g, ' ')

      .trim()

      // split to words by spaces
      .split(' ')

      // ignore words shorter than 3 chars
      .filter(word => word.length >= 3);
  }

  /**
   * Highlight substring in string with a span wrapper
   */
  private highlightSubstring(text: string, words: string|string[]) {
    if (typeof words === 'string') {
      words = [words];
    }

    const wordRegExp = new RegExp(words.join('|'), "ig");
    const CLASS_STYLE = 'search-word';

    return text.replace(wordRegExp, `<span class="${CLASS_STYLE}">$&</span>`);
  }
}

const search = new Search();

export default search;

// export default Search;