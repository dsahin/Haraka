var Body   = require('../mailbody').Body;
var Header = require('../mailheader').Header;

function _fill_body (body) {
    // Body.bodytext retains the original received text before filters are
    // applied so the filtered text isn't tested against URIBLs, etc.  Since we
    // want to test filter output, we use this hack to pull out the parsed body
    // parts that will be passed onward to the transaction.

    body.state = 'headers';
    body.parse_more("Content-Type: multipart/alternative; boundary=abcdef\n");
    body.parse_more("\n");
    body.parse_more("--abcdef\n");
    body.parse_more("Content-Type: text/plain; charset=UTF-8; format=flowed\n");
    body.parse_more("\n");
    body.parse_more("Some text for your testing pleasure.\n");
    body.parse_more("Yup that was some text all right.\n");
    body.parse_more("\n");
    var text = body.parse_more("--abcdef\n");
    body.parse_more("Content-Type: text/html; charset=UTF-8\n");
    body.parse_more("\n");
    body.parse_more("<p>This is some HTML, yo.<br>\n");
    body.parse_more("It's pretty rad.</p>\n");
    body.parse_more("\n");
    var html = body.parse_more("--abcdef--\n");
    body.parse_end();

    text = text.replace(/--abcdef\n$/, '').trim();
    html = html.replace(/--abcdef--\n$/, '').trim();

    return [text, html];
}

exports.basic = {
    'children': function (test) {
        test.expect(1);

        var body = new Body();
        _fill_body(body);

        test.equal(body.children.length, 2);
        test.done();
    },
};

exports.banners = {
    'banner': function (test) {
        test.expect(2);

        var body = new Body();
        body.set_banner(['A text banner', 'An HTML banner']);
        var parts = _fill_body(body);

        test.ok(/A text banner$/.test(parts[0]));
        test.ok(/<P>An HTML banner<\/P>$/.test(parts[1]));
        test.done();
    },

    'insert_banner': function (test){
        test.expect(2);

        var content_type;
        var buf;
        var new_buf;
        var enc = 'UTF-8';

        var body = new Body();
        var banners = [ 'textbanner', 'htmlbanner' ];

        // this is a kind of roundabout way to get at the insert_banners code
        body.set_banner(banners);
        var insert_banners_fn = body.filters[0];

        content_type = 'text/html';
        buf = new Buffer("winter </html>");
        new_buf = insert_banners_fn (content_type, enc, buf);
        test.equal(new_buf.toString(), "winter <P>htmlbanner</P></html>",
                "html banner looks ok");


        content_type = 'text/plain';
        buf = new Buffer("winter");
        new_buf = insert_banners_fn (content_type, enc, buf);
        test.equal(new_buf.toString(), "winter\ntextbanner\n",
                "text banner looks ok");

        test.done();
    },


    // found and fixed bug, if the buffer is empty this was throwing a:
    // RangeError: out of range index
    'insert_banner_empty_buffer': function (test){
        test.expect(2);

        var content_type;
        var empty_buf;
        var new_buf;
        var enc = 'UTF-8';

        var body = new Body();
        var banners = [ 'textbanner', 'htmlbanner' ];

        // this is a kind of roundabout way to get at the insert_banners code
        body.set_banner(banners);
        var insert_banners_fn = body.filters[0];


        content_type = 'text/html';
        empty_buf = new Buffer("");
        new_buf = insert_banners_fn (content_type, enc, empty_buf);
        test.equal(new_buf.toString(), "<P>htmlbanner</P>",
                "empty html part gets a banner" );

        content_type = 'text/plain';
        new_buf = insert_banners_fn (content_type, enc, empty_buf);
        test.equal(new_buf.toString(), "\ntextbanner\n",
                "empty text part gets a banner");

        test.done();
    },
};

exports.filters = {
    'empty': function (test) {
        test.expect(2);

        var body = new Body();
        body.add_filter(function (ct, enc, buf) { });
        var parts = _fill_body(body);

        test.ok(/Some text/.test(parts[0]));
        test.ok(/This is some HTML/.test(parts[1]));
        test.done();
    },

    'search/replace': function (test) {
        test.expect(2);

        var body = new Body();
        body.add_filter(function (ct, enc, buf) {
            if (/^text\/plain/.test(ct)) {
                return new Buffer("TEXT FILTERED");
            }
            else if (/text\/html/.test(ct)) {
                return new Buffer("<p>HTML FILTERED</p>");
            }
        });
        var parts = _fill_body(body);

        test.equal(parts[0], "TEXT FILTERED");
        test.equal(parts[1], "<p>HTML FILTERED</p>");
        test.done();
    },

    'regression: duplicate multi-part preamble when filters added':
    function (test) {
        test.expect(1);

        var body = new Body();
        body.add_filter(function () {});

        var lines = [];

        body.state = 'headers'; // HACK
        [
            "Content-Type: multipart/mixed; boundary=abcd\n",
            "\n",
            "This is a multi-part message in MIME format.\n",
            "--abcd\n",
            "Content-Type: text/plain\n",
            "\n",
            "Testing, 1, 2, 3.\n",
            "--abcd--\n",
        ].forEach(function (line) {
            lines.push(body.parse_more(line));
        });
        lines.push(body.parse_end());

        // Ignore blank lines.
        lines = lines.filter(function (l) {
            return l.trim();
        });

        var dupe = false;
        var line;
        while (line = lines.pop()) {
            lines.forEach(function (l) {
                dupe = dupe || line === l;
            });
        }

        test.ok(!dupe, 'no duplicate lines found');
        test.done();
    },
};
