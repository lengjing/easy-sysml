let counter = 0;
function makeId() {
    return `ast-${Date.now()}-${++counter}`;
}
/** Create a Package node */
export function createPackage(name) {
    return {
        $type: 'Package',
        $id: makeId(),
        name,
        members: [],
        imports: [],
    };
}
/** Create a PartDefinition node */
export function createPartDefinition(name, isAbstract = false) {
    return {
        $type: 'PartDefinition',
        $id: makeId(),
        name,
        isAbstract,
        members: [],
        specializations: [],
    };
}
/** Create a PartUsage node */
export function createPartUsage(name) {
    return {
        $type: 'PartUsage',
        $id: makeId(),
        name,
        typings: [],
        members: [],
    };
}
/** Create an AttributeUsage node */
export function createAttributeUsage(name) {
    return {
        $type: 'AttributeUsage',
        $id: makeId(),
        name,
        typings: [],
    };
}
/** Create a Comment node */
export function createComment(body) {
    return {
        $type: 'Comment',
        $id: makeId(),
        body,
    };
}
//# sourceMappingURL=factory.js.map