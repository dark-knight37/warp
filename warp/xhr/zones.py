import flask
from peewee import JOIN, fn, EXCLUDED

from warp.db import *
from warp import utils
from warp.utils_tabulator import *

bp = flask.Blueprint('zones', __name__, url_prefix='zones')

@bp.route("list", endpoint='list', methods=["POST"])
@utils.validateJSONInput(tabulatorSchema,isAdmin=True)
def listW():              #list is a built-in type

    requestData = flask.request.get_json()

    countQuery = UserToZoneRoles.select( \
            UserToZoneRoles.zid, \
            COUNT_STAR.filter(UserToZoneRoles.zone_role == ZONE_ROLE_ADMIN).alias("admins"), \
            COUNT_STAR.filter(UserToZoneRoles.zone_role == ZONE_ROLE_USER).alias("users"), \
            COUNT_STAR.filter(UserToZoneRoles.zone_role == ZONE_ROLE_VIEWER).alias("viewers")) \
        .group_by(UserToZoneRoles.zid)
    query = Zone.select(Zone.id, Zone.name, Zone.zone_group,
                        fn.COALESCE(countQuery.c.admins,0).alias('admins'),
                        fn.COALESCE(countQuery.c.users,0).alias('users'),
                        fn.COALESCE(countQuery.c.viewers,0).alias('viewers')) \
                .join(countQuery, join_type=JOIN.LEFT_OUTER, on=(Zone.id == countQuery.c.zid))

    (query, lastPage) = applyTabulatorToQuery(query,requestData)

    res = { "data": [ *query.iterator() ] }

    if lastPage is not None:
        res["last_page"] = lastPage

    return res, 200



deleteSchema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "id" : {"type" : "integer"},
    },
    "required": [ "id" ]
}

# Format:
# { id: id }
@bp.route("delete", methods=["POST"])
@utils.validateJSONInput(deleteSchema,isAdmin=True)
def delete():

    jsonData = flask.request.get_json()
    id = jsonData['id']

    try:
        with DB.atomic():

            Zone.delete().where(Zone.id == id).execute()

    except IntegrityError:
        return {"msg": "Error", "code":  220}, 400

    return {"msg": "ok" }, 200

addOrEditSchema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "id" : {"type" : "integer"},
        "name" : {"type" : "string"},
        "zone_group" : {"type" : "integer"},
    },
    "required": ["name", "zone_group"]
}

# Format:
# { id: 1, (optional, if missing a new group will be created)
#   name: "name",
#   zone_group: 1
@bp.route("addoredit", methods=["POST"])
@utils.validateJSONInput(addOrEditSchema,isAdmin=True)
def addOrEdit():

    jsonData = flask.request.get_json()

    class ApplyError(Exception):
        pass

    try:
        with DB.atomic():

            updColumns = {
                Zone.name: jsonData['name'],
                Zone.zone_group: jsonData['zone_group'],
            }

            if 'id' in jsonData:

                rowCount = Zone.update(updColumns).where(Zone.id == jsonData['id']).execute()
                if rowCount != 1:
                    raise ApplyError("Wrong number of affected rows", 221)

            else:

                Zone.insert(updColumns).execute()


    except IntegrityError as err:
        return {"msg": "Error", "code": 222 }, 400
    except ApplyError as err:
        return {"msg": "Error", "code": err.args[1] }, 400

    return {"msg": "ok" }, 200

membersSchema = addToTabulatorSchema({
    "properties": {
        "zid": {"type": "integer"},
    },
    "required": ["zid"]
})

@bp.route("members", methods=["POST"])
@utils.validateJSONInput(membersSchema,isAdmin=True)
def members():

    requestData = flask.request.get_json()
    zid = requestData['zid']

    query = ZoneAssign.select(Users.login, Users.name, ZoneAssign.zone_role, (Users.account_type >= ACCOUNT_TYPE_GROUP).alias("isGroup") ) \
                  .join(Users, on=(ZoneAssign.login == Users.login)) \
                  .where(ZoneAssign.zid == zid)

    (query, lastPage) = applyTabulatorToQuery(query,requestData)

    res = { "data": [ *query.iterator() ] }

    if lastPage is not None:
        res["last_page"] = lastPage

    return res

assignSchema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "zid": {"type": "integer"},
        "change": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {
                    "login" : {"type" : "string"},
                    "role" : {"enum" : [ZONE_ROLE_ADMIN,ZONE_ROLE_USER,ZONE_ROLE_VIEWER]}
                },
                "required": [ "login", "role"],
            },
        },
        "remove": {
            "type": "array",
            "minItems": 1,
            "items": { "type": "string" },
        },
    },
    "required": ['zid']
}

@bp.route("assign", methods=["POST"])
@utils.validateJSONInput(assignSchema,isAdmin=True)
def assign():

    jsonData = flask.request.get_json()

    class ApplyError(Exception):
        pass

    try:
        with DB.atomic():

            zid = jsonData['zid']

            if 'change' in jsonData:

                data = [
                    {
                        "zid": zid,
                        "login": i['login'],
                        "zone_role": i['role']
                    } for i in jsonData['change'] ]

                rowCount = ZoneAssign.insert(data) \
                                .on_conflict(
                                    conflict_target=[ZoneAssign.zid,ZoneAssign.login],
                                    update={ZoneAssign.zone_role: EXCLUDED.zone_role} ) \
                                .execute()

                if rowCount != len(jsonData['change']):
                    raise ApplyError("Wrong number of affected rows", 223)

            if 'remove' in jsonData:

                rowCount = ZoneAssign.delete() \
                                    .where( (ZoneAssign.zid == zid) & (ZoneAssign.login.in_(jsonData['remove'])) ) \
                                    .execute()

                if rowCount != len(jsonData['remove']):
                    raise ApplyError("Wrong number of affected rows", 224)


    except IntegrityError as err:
        return {"msg": "Error", "code": 225 }, 400
    except ApplyError as err:
        return {"msg": "Error", "code": err.args[1] }, 400

    return {"msg": "ok" }, 200
