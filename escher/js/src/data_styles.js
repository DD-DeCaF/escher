define(['utils'], function(utils) {
    return { import_and_check: import_and_check,
             text_for_data: text_for_data,
             float_for_data: float_for_data,
             reverse_flux_for_data: reverse_flux_for_data,
             gene_string_for_data: gene_string_for_data,
             csv_converter: csv_converter,
             genes_for_gene_reaction_rule: genes_for_gene_reaction_rule,
             evaluate_gene_reaction_rule: evaluate_gene_reaction_rule
           };

    function import_and_check(data, styles, name, all_reactions) {
        /** Convert imported data to a style that can be applied to reactions
            and nodes.

            Arguments
            ---------

            data: The data object.

            styles: The styles option.

            name: Either 'reaction_data', 'metabolite_data', or 'gene_data'

            all_reactions: Required for name == 'gene_data'. Must include all
            GPRs for the map and model.

        */
        
        // check arguments
        if (data===null)
            return null;
        if (['reaction_data', 'metabolite_data', 'gene_data'].indexOf(name)==-1)
            throw new Error('Invalid name argument: ' + name);  

        // make array
        if (!(data instanceof Array)) {
            data = [data];
        }
        // check data
        var check = function() {
            if (data===null)
                return null;
            if (data.length==1)
                return null;
            if (data.length==2) // && styles.indexOf('Diff')!=-1
                return null;
            return console.warn('Bad data style: ' + name);
        };
        check();
        data = utils.array_to_object(data);

        if (name == 'gene_data') {
            if (all_reactions === undefined)
                throw new Error('Must pass all_reactions argument for gene_data');
            data = align_gene_data_to_reactions(data, all_reactions);
        }
        
        return data;

        // definitions
        function align_gene_data_to_reactions(data, reactions) {
            var aligned = {},
                null_val = [null];
            // make an array of nulls as the default
            for (var gene_id in data) {
                null_val = data[gene_id].map(function() { return null; });
                break;
            }
            for (var reaction_id in reactions) {
                var reaction = reactions[reaction_id],
                    this_gene_data = {}; 
                if (!('gene_reaction_rule' in reaction))
                    console.warn('No gene_reaction_rule for reaction ' % reaction_id);
                // save to aligned
                // get the genes
                var genes = genes_for_gene_reaction_rule(reaction.gene_reaction_rule);
                genes.forEach(function(gene_id) {
                    this_gene_data[gene_id] = ((gene_id in data) ? data[gene_id] : null_val);
                });
                aligned[reaction_id] = { rule: reaction.gene_reaction_rule,
                                         genes: this_gene_data };
            }
            return aligned;
        }
    }

    function float_for_data(d, styles, compare_style) {
        // all null
        if (d === null)
            return null;

        // absolute value
        var take_abs = (styles.indexOf('abs') != -1);
        
        if (d.length==1) { // 1 set
            // 1 null
            if (d[0] === null)
                return null;
            
            return abs(d[0], take_abs);
        } else if (d.length==2) { // 2 sets            
            // 2 null
            if (d[0] === null || d[1] === null)
                return null;
            
            if (compare_style == 'diff')
                return diff(d[0], d[1], take_abs)
            else if (compare_style == 'log2_fold') {
                return log2_fold(d[0], d[1], take_abs);
            } else if (d.length==2)
                throw new Error('Bad data compare_style: ' + compare_style);
        }

        // definitions
        function abs(x, take_abs) {
            return take_abs ? Math.abs(x) : x;
        }
        function diff(x, y, take_abs) {
            if (take_abs) return Math.abs(y) - Math.abs(x);
            else return y - x;
        }
        function log2_fold(x, y, take_abs) {
            if (x == 0) return null;
            if (take_abs) {
                x = Math.abs(x);
                y = Math.abs(y);
            } else if (y / x < 0) {
                return null;
            }
            return Math.log(y / x) / Math.log(2);
        }
    }

    function reverse_flux_for_data(d) {
        if (d === null || d[0] === null)
            return false;
        return (d[0] < 0);
    }

    function gene_string_for_data(rule, gene_values, styles, compare_style) {
        if (gene_values === null) return '';
        var out = rule,
            format = d3.format('.3g');
        for (var gene_id in gene_values) {
            var d = gene_values[gene_id];
            if (d.length==1) {
                out = replace_gene_in_rule(out, gene_id, (gene_id + ' (' + null_or_d(d[0], format) + ')\n'));
            }
            if (d.length==2) {
                var f = float_for_data(d, styles, compare_style),
                    new_str = (gene_id + ' (' +
                               null_or_d(d[0], format) + ', ' +
                               null_or_d(d[1], format) + ': ' +
                               null_or_d(f, format) +
                               ')\n');
                out = replace_gene_in_rule(out, gene_id, new_str);
            }
        }
        out = out.replace(/\n\s*\)?\s*$/, ')');
        return out;
        
        // definitions
        function null_or_d(d, format) {
            return d===null ? 'nd' : format(d);
        }
    }
    
    function text_for_data(d, f) {
        if (d === null)
            return null_or_d(null);
        if (d.length == 1) {
            var format = d3.format('.4g');
            return null_or_d(d[0], format);
        }
        if (d.length == 2) {
            var format = d3.format('.3g'),
                t = null_or_d(d[0], format);
            t += ', ' + null_or_d(d[1], format);
            t += ': ' + null_or_d(f, format);
            return t;
        }
        return '';

        // definitions
        function null_or_d(d, format) {
            return d === null ? '(nd)' : format(d);
        }
    }

    function csv_converter(csv_rows) {
        /** Convert data from a csv file to json-style data.

         */
        // count rows
        var c = csv_rows[0].length,
            converted = [];
        if (c < 2 || c > 3)
            throw new Error('CSV file must have 2 or 3 columns');
        // set up rows
        for (var i = 1; i < c; i++) {
            converted[i - 1] = {};
        }
        // fill
        csv_rows.forEach(function(row) {
            for (var i = 1, l = row.length; i < l; i++) {
                converted[i - 1][row[0]] = parseFloat(row[i]);
            }
        });
        return converted;
    }
    
    function genes_for_gene_reaction_rule(rule) {
        /** Find genes in gene_reaction_rule string.

            Arguments
            ---------

            rule: A boolean string containing gene names, parentheses, AND's and
            OR's.

        */
        genes = rule
        // remove ANDs and ORs, surrounded by space or parentheses
            .replace(/([\(\) ])(?:and|or)([\)\( ])/ig, '$1$2')
        // remove parentheses
            .replace(/\(|\)/g, '')
        // split on whitespace
            .split(' ')
            .filter(function(x) { return x != '' });
        return genes;
    }
    
    function evaluate_gene_reaction_rule(rule, gene_values) {
        /** Return a value given the rule and gene_values object.

            With the current version, all negative values are converted to zero,
            OR's are sums and AND's are Min()'s.

            TODO Deal with multiple datasets, e.g. Diff.

            Arguments
            ---------

            rule: A boolean string containing gene names, parentheses, AND's and
            OR's.

            gene_values: Object with gene_ids for keys and numbers for values.

        */

        var null_val = [null],
            l = 1;
        // make an array of nulls as the default
        for (var gene_id in gene_values) {
            null_val = gene_values[gene_id].map(function() { return null; });
            l = null_val.length;
            break;
        }
        
        if (rule == '') return null_val;

        // for each element in the arrays
        var out = [];
        for (var i=0; i<l; i++) {
            // get the rule
            var curr_val = rule;
            
            var all_null = true;
            for (var gene_id in gene_values) {
                var val;
                if (gene_values[gene_id][i] === null || gene_values[gene_id][i] < 0) {
                    val = 0;
                } else {
                    val = gene_values[gene_id][i];
                    all_null = false;
                }
                curr_val = replace_gene_in_rule(curr_val, gene_id, val);
            }
            if (all_null) {
                out.push(null);
                continue;
            }

            // recursively evaluate
            while (true) {
                // arithemtic expressions
                var new_curr_val = curr_val,
                    // or's
                    reg = /(^|\()[0-9+.\s]+\s+(or\s+[0-9+.\s]+)+(\)|$)/ig,
                    matches = new_curr_val.match(reg);
                if (matches !== null) {
                    matches.forEach(function(match) {
                        // remove parentheses, and sum
                        var ev = match.replace(/[\(\)]/g, ''),
                            nums = ev.split(/\s+or\s+/i).map(parseFloat),
                            sum = nums.reduce(function(a, b) { return a + b;});
                        new_curr_val = new_curr_val.replace(match, sum);
                    });
                }
                // and's
                var reg = /(^|\()[0-9+.\s]+\s+(and\s+[0-9+.\s]+)+(\)|$)/ig,
                    matches = new_curr_val.match(reg);
                if (matches !== null) {
                    matches.forEach(function(match) {
                        // remove parentheses, and find min
                        var ev = match.replace(/[\(\)]/g, ''),
                            nums = ev.split(/\s+and\s+/i).map(parseFloat),
                            min = Math.min.apply(null, nums);
                        new_curr_val = new_curr_val.replace(match, min);
                    });
                }
                // break if there is no change
                if (new_curr_val == curr_val)
                    break;
                curr_val = new_curr_val;
            } 
            // strict test for number
            var num = Number(curr_val);
            if (isNaN(num)) {
                console.warn('Could not evaluate ' + rule);
                out.push(null);
            } else {
                out.push(num);
            }
        }
        return out;
    }
    
    function replace_gene_in_rule(rule, gene_id, val) {
        // get the escaped string, with surrounding space or parentheses
        var space_or_par_start = '(^|[\\\s\\\(\\\)])',
            space_or_par_finish = '([\\\s\\\(\\\)]|$)',
            escaped = space_or_par_start + escape_reg_exp(gene_id) + space_or_par_finish;
        return rule.replace(new RegExp(escaped, 'g'),  '$1' + val + '$2');
        
        // definitions
        function escape_reg_exp(string) {
            return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
        }
    }
});
