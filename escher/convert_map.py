"""This script has two purposes:

1. Apply the attributes from a cobra model to an existing Escher
map. For instance, update modified reversibilities.

2. Convert maps made with Escher beta versions to valid jsonschema/1-0-0
maps.

Usage:

Using a Theseus model name (https://github.com/zakandrewking/Theseus).
python convert_map.py old_map.json iJO1366

Using a SBML or JSON model path
python convert_map.py another_old_map.json path/to/iJO1366.sbml

"""

from __future__ import print_function, unicode_literals

try:
    import cobra.io
    import jsonschema
except ImportError:
    raise Exception(('The Python packages jsonschema and COBRApy (0.3.0b3 or later) '
                     'are required for converting maps.'))
try:
    from theseus import load_model
except ImportError:
    print('Theseus not available (https://github.com/zakandrewking/Theseus)')
import sys
import json
from os.path import basename, join
try:
    from urllib.request import urlopen
except ImportError:
    from urllib import urlopen
import re

from escher.validate import get_jsonschema, check_segments

def main():
    """Load an old Escher map, and generate a validated map.

    """
    try:
        in_file = sys.argv[1]
        model_path = sys.argv[2]
    except IndexError:
        raise Exception("Usage: python convert_map.py old_map.json path/to/model.sbml")
   
    # get the cobra model
    try:
        model = load_model(model_path)
    except Exception:
        try:
            model = cobra.io.load_json_model(model_path)
        except (IOError, ValueError):
            try:
                model = cobra.io.read_sbml_model(model_path)
            except IOError:
                raise Exception('Could not find model in theseus or filesystem: %s' % model_path)

    # get the current map
    with open(in_file, 'r') as f:
        out = json.load(f)

    the_map = convert(out, model)
    
    # don't replace the file
    out_file = in_file.replace('.json', '_converted.json')
    print('Saving validated map to %s' % out_file)
    with open(out_file, 'w') as f:
        json.dump(the_map, f, allow_nan=False)

def convert(map, model):
    # check for new, 2-level maps
    if len(map) == 2:
        map_body = map[1]
    else:
        map_body = map

    # add missing elements
    for k in ['nodes', 'reactions', 'text_labels']:
        if k not in map_body:
            map_body[k] = {}
    # default canvas
    if 'canvas' not in map_body:
        map_body['canvas'] = { 'x': -1440,
                               'y': -775,
                               'width': 4320,
                               'height': 2325 }        
    
    # keep track of deleted nodes and reactions
    nodes_to_delete = set()
    reactions_to_delete = set()

    # nodes
    for id, node in map_body['nodes'].items():
        # follow rules for type
        # metabolites
        if node['node_type'] == 'metabolite':
            # no bigg_id
            if not 'bigg_id' in node:
                print('No bigg_id for node %s. Deleting.' % id)
                nodes_to_delete.add(id)
                
            # unsupported attributes
            for key in node.keys():
                if not key in ["node_type", "x", "y", "bigg_id", "name",
                               "label_x", "label_y", "node_is_primary"]:
                    del node[key]
                    
            # find the metabolite
            try:
                cobra_metabolite = model.metabolites.get_by_id(node['bigg_id'])
            except KeyError:
                print('Could not find metabolite %s in model. Deleting.' % node['bigg_id'])
                nodes_to_delete.add(id)
                continue
            # apply new display names
            node['name'] = cobra_metabolite.name

            # node_is_primary defaults to False
            if not 'node_is_primary' in node or node['node_is_primary'] not in [True, False]:
                node['node_is_primary'] = False
        # markers
        elif node['node_type'] in ['multimarker', 'midmarker']:
            # unsupported attributes
            for key in node.keys():
                if not key in ["node_type", "x", "y"]:
                    del node[key]
        # invalid node_type
        else:
            nodes_to_delete.add(id)
            continue
        
    # update reactions
    for id, reaction in map_body['reactions'].items():
        # missing attributes
        will_delete = False
        for k in ["bigg_id", "segments", "label_x", "label_y"]:
            if not k in reaction:
                print('No %s for reaction %s. Deleting.' % (k, id))
                reactions_to_delete.add(id)
                will_delete = True
        if will_delete:
            continue

        # unsupported attributes
        for key in reaction.keys():
            if not key in ["name", "bigg_id","reversibility",
                           "label_x", "label_y", "gene_reaction_rule",
                           "genes", "metabolites", "segments"]:
                del reaction[key]

        # unsupported attributes in segments
        for s_id, segment in reaction['segments'].items():
            for key in segment.keys():
                if not key in ["from_node_id", "to_node_id", "b1", "b2"]:
                    del segment[key]

        # get reaction
        try:
            cobra_reaction = model.reactions.get_by_id(reaction['bigg_id'])
        except KeyError:
            print('Could not find metabolite %s in model. Deleting.' % node['bigg_id'])
            reactions_to_delete.add(id)
            continue
        reaction['gene_reaction_rule'] = cobra_reaction.gene_reaction_rule
        reaction['reversibility'] = (cobra_reaction.lower_bound < 0 and cobra_reaction.upper_bound > 0)
        # reverse metabolites if reaction runs in reverse
        rev_mult = (-1 if
                    (cobra_reaction.lower_bound < 0 and cobra_reaction.upper_bound <= 0)
                    else 1)
        # use metabolites from reaction
        reaction['metabolites'] = [{'bigg_id': met.id, 'coefficient': coeff * rev_mult}
                                   for met, coeff in
                                   cobra_reaction.metabolites.items()]
            
        reaction['name'] = cobra_reaction.name

        reaction['genes'] = []
        for gene in genes_for_gene_reaction_rule(reaction['gene_reaction_rule']):
            try:
                cobra_gene = model.genes.get_by_id(gene)
            except KeyError:
                print('Could not find gene %s in model. Setting name to ID.')
                reaction['genes'].append({'bigg_id': gene, 'name': gene})
                continue
            reaction['genes'].append({'bigg_id': gene, 'name': cobra_gene.name})
        
        # remove any lost segments
        reaction['segments'] = {id: seg for id, seg in reaction['segments'].items()
                                if ((seg['to_node_id'] in map_body['nodes'] and seg['to_node_id'] not in nodes_to_delete) and
                                    (seg['from_node_id'] in map_body['nodes'] and seg['from_node_id'] not in nodes_to_delete))}

    # delete those reactions
    for reaction_id in reactions_to_delete:
        del map_body['reactions'][reaction_id]

    # delete those nodes
    for node_id in nodes_to_delete:
        del map_body['nodes'][node_id]
        
    # delete unsupported elements
    for key in map_body.keys():
        if not key in ["nodes", "reactions", "text_labels", "canvas"]:
            del map_body[key]

    header = {
        "schema": "https://zakandrewking.github.io/escher/escher/jsonschema/1-0-0#",
        "homepage": "https://zakandrewking.github.io/escher",
        "map_name": "",
        "map_id": "",
        "map_description": ""
        }
    if len(map) == 2:
        for key, value in map[0].items():
            if key in ['schema', 'homepage']: continue
            header[key] = value
    
    the_map = [header, map_body]
        
    schema = get_jsonschema()
    jsonschema.validate(the_map, schema)

    nonvalid = check_segments(the_map)
    if len(nonvalid) == 0:
        print('Map is valid')
        return the_map
    else:
        print('Error. No nodes for segments:')
        print('\n'.join(str(x) for x in nonvalid))
        return None

def genes_for_gene_reaction_rule(rule):
    """ Find genes in gene_reaction_rule string.

    Arguments
    ---------

    rule: A boolean string containing gene names, parentheses, AND's and
    OR's.

    """
    
    # remove ANDs and ORs, surrounded by space or parentheses     
    rule = re.sub(r'([()\s])(?:and|or)([)(\s])', r'\1\2', rule)
    # remove parentheses
    rule = re.sub(r'\(|\)', r'', rule)
    # split on whitespace
    genes = [x for x in rule.split(' ') if x != '']
    return genes

if __name__=="__main__":
    main()
