/*
    Viking Table
    -----------

    id: string                                  // required id for saving view settings
    class: string                              // optional classes to add to component
    collection: 
    link: function(record)
    loader_count: integer                      // optional number of rows to use for preload, defaults to false which uses collection.per_page
    pagination: boolean                        // optional show pagination
    secondarySort: hash                        // optional defaults to updated_at
    columns: hash of columns, keys are column ids
        render: function(record) return string|node
        header: string
        sort: string                            // optional attribute to sort by
        class: string                           // optional
        loader_rows: integer                    // optional number of rows to load when rendering loader
        example = [{ 
            status: {
                render: r => r.get('status'),   // optional will use key as attribute
                header: 'Status',               //optional will use key
                sortable: false                 // optional, default false
            }
        }]
    defaultColumns: array of column ids
        
*/
import { icon_tag } from 'helpers';

export default Viking.View.extend({
    className: "viking-table",

    permit: [
        'columns',
        'defaultColumns',
        'link',
        'store_key'
    ],

    events: {
        'click .js-more': 'incrementPage',
        'change .js-per-page': 'updatePerPage',
        'click .viking-table-sort': 'selectOrder',
        'click .js-customize': 'openCustomizeModal',
        'click .js-reset': 'resetColumns',
        'mousedown .viking-table-resize-handle': 'initiateColumnResize'
    },

    options: {
        loader_count: false,
        pagination: true,
        class: '',
        secondarySort: {
            updated_at: 'desc'
        },
        manageCollection: true
    },

    initialize(options) {
        this.listenTo(this.collection, 'add', this.addRecord);
        this.listenTo(this.collection, 'remove', this.removeRecord);
        this.listenTo(this.collection, 'sync', this.renderPagination);
        this.listenTo(this.collection, 'sync', this.removeLoaders);
        this.listenTo(this.collection, 'sync', this.renderEmptyNotice);
        this.listenTo(this.collection, 'request', this.renderLoaders);
        this.listenTo(this.collection.cursor, 'change:per_page', this.saveSettings);

        this.resizeColumn = this.resizeColumn.bind(this);
        this.endColumnResize = this.endColumnResize.bind(this);

        Object.assign(this.options, options);
        this.settings = _.defaults(this.getSettings(), {
            per_page: this.collection.cursor.get('per_page'),
            order: [this.options.secondarySort],
            columns: _.compact(_.map(_.uniq(this.defaultColumns.concat(_.keys(this.columns))), function (id) {
                if (!_.keys(this.columns).includes(id)) return null;
                return {
                    id: id,
                    options: {
                        visible: this.defaultColumns.includes(id)
                    }
                }
            }, this))
        });

        _.difference(_.keys(this.columns), _.map(this.settings.columns, m => m.id)).forEach(function (key) {
            this.settings.columns.push({
                id: key,
                options: {
                    visible: false
                }
            })
        }, this);

        this.collection.cursor.set('per_page', this.settings.per_page, { silent: true });
        this.collection.order(this.settings.order, { silent: true });

        if (this.include) {
            this.collection.include(this.include, { silent: true });
        }

        if (!this.store_key) throw 'store_key needs to be set on VikingTable';
    },

    render() {
        this.$el.addClass('viking-table');
        this.$el.addClass(this.options.class);
        this.$el.html(`
            <div class="viking-table-container">
                <div class="viking-table-actions">
                    <button class="js-customize reset">${icon_tag("hidden")} Show/Hide Columns</button>
                    <button class="js-reset reset">${icon_tag("refresh")} Reset Columns</button>
                </div>
                <div class="viking-table-table">
                    <table>
                        <colgroup></colgroup>
                        <thead>
                            <tr></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
            <div class="viking-table-pagination"></div>
        `);

        this.settings.columns.forEach(column => {
            if (column.options.visible == false) return;
            var columnOptions = this.columns[column.id];
            var cell = $(`
                <th class="${columnOptions.class || ""}" id="${column.id}">
                    ${typeof columnOptions.header != 'undefined' ? columnOptions.header : column.id.titleize()}
                </th>
            `);
            if (columnOptions.sort) cell.wrapInner(`<a class="viking-table-sort" data-attribute="${columnOptions.sort}">`);
            cell.append('<div class="viking-table-resize-handle">');

            this.$('colgroup').append(`<col id="${column.id}" style="width:${column.options.width}px">`);
            this.$('thead tr').append(cell);
        })

        if (this.settings.columns[0].options.width) {
            this.$('table').css('table-layout', 'fixed');
        }

        this.collection.each(this.addRecord, this);

        this.updateActiveOrder();
        this.renderPagination();
        if (this.options.manageCollection) {
            this.collection.fetch();
        }
        return this;
    },

    addRecord(record) {
        var row = $(this.link ? `<a href="${this.link(record)}" class="viking-table-row">` : `<tr>`);
        row.attr('id', record.id);
        this.settings.columns.forEach(column => {
            if (column.options.visible == false) return;
            var columnOptions = this.columns[column.id];
            var content = columnOptions.render ? columnOptions.render(record) : record.get(column.id);
            if (content == null) content = "";
            var cell = $(`<td class="${columnOptions.class || ""}"></td>`);
            cell.append(content);
            row.append(cell);
        }, this)

        this.$('tbody').append(row);
        this.$('.viking-table-loader').first().remove();
    },

    removeRecord(record) {
        this.$(`tr#${record.id}, .viking-table-row#${record.id}`).remove();
    },

    renderLoaders() {
        _.times(this.options.loader_count || this.collection.length || this.collection.cursor.get('per_page'), function () {
            var row = $('<tr class="viking-table-loader">')
            this.settings.columns.forEach(function (column) {
                if (column.options.visible == false) return;
                var columnOptions = this.columns[column.id];
                var cell = $(`<td class="${columnOptions.class || ""}" style="width:${column.options.width}px"><span class="loader-bar inline-block rounded" style="line-height: 0.9; width: ${_.sample([100, 75, 50])}%">&nbsp;</span></td>`);
                if (columnOptions.loader_rows) {
                    _.times(columnOptions.loader_rows - 1, function () {
                        cell.append(`<div class="text-small"><span class="loader-bar inline-block rounded" style="line-height: 0.9; width: ${_.sample([100, 75, 50])}%">&nbsp;</span></div>`);
                    })
                }
                row.append(cell);
            }, this);
            this.$('tbody').append(row);
        }, this);
    },

    removeLoaders() {
        this.$('.js-empty-notice').remove();
        this.$('.viking-table-loader').remove();
    },

    renderEmptyNotice() {
        if (this.collection.length > 0) return;
        this.$('tbody').append(`
            <tr><td class="js-empty-notice text-italic text-gray">None</td></tr>
        `);
    },

    /*
        Pagination
    */
    renderPagination(cursor, models) {
        if (this.options.pagination == false) return;
        this.$('.viking-table-pagination').html(`
            <div class="text-center pad-v ">
                <div class="text-gray-dark margin-bottom-half">
                    ${this.collection.length} ${this.collection.model.modelName.plural.titleize()}
                    Loaded of
                    <span class="js-total">...</span>
                </div>
                <div class="js-more-action relative">
                    <button class="js-more uniformButton">Load More</button>
                    <span class="margin-left">
                        Load By
                    </span>
                    <select class="js-per-page">
                        ${_.map([25, 50, 100], v => `<option ${this.collection.cursor.get('per_page') == v ? 'selected' : ''}>${v}</option>`).join()}
                    </select>
                </div>
            </div>
        `)

        this.collection.count(function (total) {
            this.$('.viking-table-pagination .js-total').text(total);
            if (total == this.collection.length) {
                this.$('.viking-table-pagination .js-more-action').remove();
            }
        }.bind(this));
    },

    incrementPage(e) {
        this.collection.cursor.incrementPage({
            remove: false
        });
    },

    updatePerPage(e) {
        this.settings.per_page = $(e.currentTarget).val();
        this.collection.cursor.set('per_page', $(e.currentTarget).val());
    },

    /*
        Ordering
    */
    selectOrder(e) {
        var order_key = $(e.currentTarget).data('attribute');
        var direction = 'asc';
        if (this.settings.order[0][order_key] && this.settings.order[0][order_key].asc) direction = 'desc';

        this.settings.order = [{
            [order_key]: {
                [direction]: 'nulls_last'
            }
        }, this.options.secondarySort];
        this.collection.order(this.settings.order, { silent: true });

        this.saveSettings();
        if (this.options.manageCollection) {
            this.collection.fetch();
        }
        this.collection.remove(this.collection.models);
        this.updateActiveOrder();
    },

    updateActiveOrder() {
        this.$('.viking-table-sort').removeClass('-active -active-asc -active-desc');
        var order_key = _.keys(this.settings.order[0])[0];
        var direction = this.settings.order[0][order_key].asc ? 'asc' : 'desc';
        this.$(`.viking-table-sort[data-attribute="${order_key}"]`).addClass('-active -active-' + direction);
    },

    /*
        Custom Columns
    */
    initiateColumnResize(e) {
        $(e.currentTarget).addClass('hover');
        $(window).on('mousemove', this.resizeColumn);
        $(window).on('mouseup', this.endColumnResize);

        this.$('thead th').each(function (i, el) {
            var id = $(el).attr('id')
            var col = this.$('colgroup col#' + id)
            $(col).css('width', $(el).outerWidth());
            _.findWhere(this.settings.columns, { id: id }).options.width = $(el).outerWidth();
        }.bind(this));

        this.$('table').css('table-layout', 'fixed');

        this.resizingCell = $(e.currentTarget).parent();
        var col = this.$('colgroup col#' + this.resizingCell.attr('id'));
        $(col).css('border-right', '1px dashed #3f91cd');
    },

    endColumnResize(e) {
        $(window).off('mousemove', this.resizeColumn);
        $(window).off('mouseup', this.endColumnResize);
        this.$('colgroup col').css('border-right', '');
        this.$('.viking-table-resize-handle.hover').removeClass('hover');
        this.saveSettings();
        delete this.resizingCell;
    },

    resizeColumn(e) {
        if (!this.resizingCell) return;
        var col = this.$('colgroup col#' + this.resizingCell.attr('id'));
        var newWidth = e.pageX - this.resizingCell.offset().left;
        if (newWidth < 50) newWidth = 50;
        $(col).css('width', newWidth);
        _.findWhere(this.settings.columns, { id: this.resizingCell.attr('id') }).options.width = newWidth;
    },

    resetColumns(e) {
        this.settings.columns.forEach(function (column) {
            delete column.options.width;
            column.options.visible = this.defaultColumns.includes(column.id);
        }, this);
        this.render();
        this.saveSettings();
    },

    openCustomizeModal() {
        var form = $(`
            <div class="viking-table-customize-modal pad-v bg-background rounded min-width-300-px">
                <h2 class="text-center margin-bottom">Customize Columns</h2>
                <div class="grid grid-gutter-half grid-nowrap">
                    <div class="width-50-p">
                        <div class="js-included height-100-p bg-white border rounded"></div>
                    </div>
                    <div class="width-50-p">
                        <div class="js-excluded height-100-p bg-white border rounded"></div>
                    </div>
                </div>
                <div class="margin-top text-center">
                    <button class="js-close uniformButton -green -large">Update</button>
                </div>
            </div>
        `);

        form.on('change', 'input', function (e) {
            var column = _.findWhere(this.settings.columns, { id: e.currentTarget.value });
            if (e.currentTarget.checked) {
                column.options.visible = true;
                $(e.currentTarget).parents('.js-item').appendTo(includedGroup);
            } else {
                column.options.visible = false;
                $(e.currentTarget).parents('.js-item').appendTo(excludedGroup);
            }
        }.bind(this));


        var includedGroup = form.find('.js-included');
        var excludedGroup = form.find('.js-excluded');

        this.settings.columns.forEach(column => {
            var columnOptions = this.columns[column.id];
            var target = column.options.visible ? includedGroup : excludedGroup;
            target.append(`
                <div class="js-item text-nowrap pad-v-quarter grid grid-gutter-half grid-center grid-nowrap">
                    <label class="col-fill">
                        <input type="checkbox" value="${column.id}" ${column.options.visible ? 'checked' : ''}>
                        ${columnOptions.header || column.id.titleize()}
                    </label>
                    <span class="col js-move cursor-handle">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13.28 20" style="width:9px"><path d="M4.27,13.05a.54.54,0,0,0-.75,0,.53.53,0,0,0,0,.75l6.1,6a.54.54,0,0,0,.76,0l6.1-6a.53.53,0,0,0,0-.75.54.54,0,0,0-.75,0L10,18.56Z" transform="translate(-3.36 0)"/><path d="M15.73,6.94a.53.53,0,0,0,.75-.75l-6.1-6a.54.54,0,0,0-.76,0l-6.1,6a.53.53,0,1,0,.75.75L10,1.43Z" transform="translate(-3.36 0)"/></svg>
                    </span>
                </div>
            `)
        }, this);

        includedGroup.dragsort({
            dragSelector: '.js-move',
            itemSelector: 'div',
            placeHolderTemplate: `<div class="block pad-v-quarter border-dashed">&nbsp;</div>`,
            dragEnd: _.bind(function () {
                var keys = _.map(includedGroup.find('input'), el => el.value);
                this.settings.columns.sort((a, b) => keys.indexOf(a.id) - keys.indexOf(b.id));
            }, this)
        })

        var modal = this.subView(Uniform.Modal, {
            content: form[0]
        }).render();
        modal.on('closed', function () {
            this.render();
            this.saveSettings();
        }.bind(this));

        form.on('click', '.js-close', function (e) {
            modal.close();
        })
    },

    /*
        View Settings
    */
    saveSettings() {
        localStorage.setItem('table_settings/' + this.store_key, JSON.stringify(this.settings));
    },

    getSettings() {
        var stored = localStorage.getItem('table_settings/' + this.store_key);
        return stored ? JSON.parse(stored) : {};
    }
})