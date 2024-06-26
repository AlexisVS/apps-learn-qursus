import {$} from "./jquery-lib";
import {PageClass} from "./Page.class";
import {ApiService} from "./qursus-services";
import ModuleClass from "./Module.class";
import {LearningAppMessage, MessageEventEnum} from "./LearningAppMessage";

export class ChapterClass {
    // allow virtual keys for dynamic assignment after API updates (we make sure to only use keys defined below)
    [key: string]: any;

    public id: number;
    public identifier: number;
    public order: number;
    public title: string;

    public pages: PageClass[];

    public selection: number

    private readonly $container: JQuery;
    private parent: ModuleClass;

    // chapter-specific context
    public context: any = {
        actions_counter: 0,
        selection: 0,
        page_index: 0,
        mode: 'view'
    };

    constructor(
        id: number = 0,
        identifier: number = 1,
        order: number,
        title: string,
        pages: PageClass[]
    ) {
        this.id = id;
        this.identifier = identifier;
        this.order = order;
        this.title = title;

        this.pages = pages;

        this.$container = $('<div id="chapter-container" class="chapter"></div>');
    }

    public setParent(module: ModuleClass) {
        this.parent = module;
    }

    public setContext(context: any) {
        for (let key of Object.keys(this.context)) {
            if (context.hasOwnProperty(key)) {
                this.context[key] = context[key];
            }
        }
    }

    public getParent() {
        return this.parent;
    }

    public getContainer() {
        return this.$container;
    }

    public getContext() {
        return this.context;
    }

    public render(context: any) {

        this.setContext(context);

        if (this.pages && this.pages.length > this.context.page_index) {

            let item: any = this.pages[this.context.page_index];

            let page: PageClass = new PageClass(
                item.id,
                item.identifier,
                item.order,
                item.leaves,
                item.type,
                item.next_active,
            );

            this.pages[this.context.page_index] = page;
            page.setParent(this);

            this.$container.empty().append(page.render(context));
        } else {
            // append an empty page container
            this.$container.empty().append('<div id="page-container" class="page"></div>');
            $('body').find('.controls.page-controls').remove();
        }

        if (context.mode == 'edit') {
            /*
             append controls to module container
            */
            // remove any previously rendered controls
            $('body').find('.controls.chapter-controls').remove();

            let $chapter_actions = $('<div class="actions chapter-actions"></div>');
            let $chapter_controls = $('<div class="controls chapter-controls"></div>');
            let $chapter_label = $('<div class="label"></div>');
            let $chapter_label_text = $('<span>Chapter ' + this.identifier + '</span>');
            let $chapter_edit_button = $('<div class="action-button chapter-edit-button" title="Edit Chapter"><span class="material-icons mdc-fab__icon">mode_edit</span></div>');
            let $chapter_add_button = $('<div class="action-button chapter-add-button" title="Add a Page"><span class="material-icons mdc-fab__icon">add</span></div>');
            let $chapter_delete_button = $('<div class="action-button chapter-delete-button" title="Delete Chapter"><span class="material-icons mdc-fab__icon">delete</span></div>');

            $chapter_actions.append($chapter_edit_button).append($chapter_add_button).append($chapter_delete_button);
            $chapter_label.append($chapter_label_text);
            $chapter_label.append($chapter_actions);
            $chapter_controls.append($chapter_label);
            $chapter_controls.appendTo(this.parent.getContainer());

            /*
             setup action handlers
            */
            $chapter_edit_button.on('click', () => {
                window.eq.popup({
                    entity: 'learn\\Chapter',
                    type: 'form',
                    mode: 'edit',
                    domain: ['id', '=', this.id],
                    callback: (data: any) => {
                        if (data && data.objects) {
                            for (let object of data.objects) {
                                if (object.id != this.id) continue;
                                for (let field of Object.keys(this)) {
                                    if (object.hasOwnProperty(field)) {
                                        this[field] = (this[field]) ? ((this[field].constructor)(object[field])) : object[field];
                                    }
                                }
                            }
                            // request refresh for current context
                            this.parent.propagateContextChange({refresh: true});
                        }
                    }
                });
            });

            $chapter_add_button.on('click', () => {
                let page_identifier = (this.pages) ? this.pages.length + 1 : 1;
                window.eq.popup({
                    entity: 'learn\\Page',
                    type: 'form',
                    name: 'create',
                    mode: 'edit',
                    purpose: 'create',
                    domain: [['chapter_id', '=', this.id], ['identifier', '=', page_identifier], ['order', '=', page_identifier]],
                    callback: (data: any) => {
                        // append new page to chapter
                        if (data && data.objects) {
                            for (let item of data.objects) {
                                let page = new PageClass(
                                    Number(item.id),
                                    Number(item.identifier),
                                    Number(item.order),
                                    item.leaves,
                                    item.type,
                                    item.next_active,
                                );
                                if (!this.pages) {
                                    this.pages = new Array<PageClass>();
                                }
                                this.pages.push(page);
                            }
                            this.propagateContextChange({refresh: true});
                        }
                    }
                });
            });

            $chapter_delete_button.on('click', () => {
                if (window.confirm("Chapter is about to be removed. Do you confirm ?")) {
                    ApiService.update('learn\\Module', [this.parent.id], {'chapters_ids': [-this.id]}, true);
                    this.parent.context.chapter_index = this.parent.chapters.findIndex(chapter => chapter.id === this.id) - 1;
                    this.parent.propagateContextChange({'$module.remove_chapter': this.id, refresh: true});

                    LearningAppMessage.send({
                        type: MessageEventEnum.QU_CHAPTER_REMOVED,
                        data: {
                            module_id: this.parent.id,
                            chapter_id: this.id
                        }
                    })
                }
            });
        }
        return this.$container;
    }

    public propagateContextChange(contextChange: any) {
        // console.log('Chapter::propagateContext', contextChange);

        for (let elem in contextChange) {
            if (elem.indexOf('$chapter') == 0) {
                let value = contextChange[elem];
                const parts = elem.split('.');
                if (parts.length > 1) {
                    if (parts[1] == 'actions_counter') {
                        ++this.context[parts[1]];
                        // relay counter to parent leaf
                        contextChange['$module.actions_counter'] = value;
                    } else if (parts[1] == 'remove_page') {
                        // value is widget id
                        for (const [index, page] of this.pages.entries()) {
                            if (page.id == value) {
                                this.pages.splice(index, 1);
                            }
                        }
                    } else {
                        this.context[parts[1]] = value;
                    }
                }
            }
        }

        this.parent.propagateContextChange(contextChange);
    }

    public onContextChange(contextChange: any) {
        // console.log('Chapter::onContextChange', contextChange, this.context);

        for (let elem of Object.keys(contextChange)) {
            if (elem.indexOf('$module.mode') == 0) {
                this.context.mode = contextChange[elem];
            }
        }

        for (let elem of Object.keys(this.context)) {
            contextChange['$chapter.' + elem] = this.context[elem];
        }

        // relay contextChange to children

        if (this.pages && this.pages.length && typeof this.pages[this.context.page_index].onContextChange === 'function') {
            this.pages[this.context.page_index].onContextChange(contextChange);
        }
    }
}

export default ChapterClass;